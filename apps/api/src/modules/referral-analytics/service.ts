import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { and, desc, eq, exists, gt, inArray, isNull, sql } from "drizzle-orm"
import {
  getDb,
  partners,
  referralAnalyticsEvents,
  referralAnalyticsItems,
  referralAttributions,
  referralLinkClicks,
  referralLinks,
} from "@vizaje/db"
import { getApiEnv } from "../../env"
import { resolveActiveReferralCode } from "../referral-links/service"

const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const REFERRAL_VISIT_DEDUP_WINDOW_MS = 30 * 60 * 1000
const CONTEXT_VERSION = "v1"
const orderStatusRank: Record<string, number> = {
  new: 10,
  progress: 20,
  paid: 30,
  confirmed: 40,
  finished: 50,
  cancelled: 100,
}
const confirmedStatuses = new Set(["paid", "confirmed", "finished"])

export class ReferralAnalyticsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = "ReferralAnalyticsError"
  }
}

type ActiveReferralLink = NonNullable<Awaited<ReturnType<typeof resolveActiveReferralCode>>>

export function isReferralAnalyticsPartnerAllowed(partnerId: string) {
  return getApiEnv().REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS.includes(partnerId)
}

export type AnalyticsItemInput = {
  legacyProductId?: string | null
  legacyProductGuid?: string | null
  quantity: number
  unitPrice?: number | string | null
  lineTotal?: number | string | null
}

export type AddToCartEventInput = {
  eventId: string
  attributionContext: string
  occurredAt: string
  items: AnalyticsItemInput[]
}

export type LegacyOrderEventInput = {
  eventId: string
  eventVersion: "v1"
  eventType: "order.created" | "order.updated" | "order.confirmed" | "order.cancelled"
  orderId: string
  attributionContext: string
  status: "new" | "progress" | "paid" | "confirmed" | "finished" | "cancelled"
  amount: string
  currency: "MDL"
  occurredAt: string
  items: AnalyticsItemInput[]
}

type ContextPayload = {
  v: 1
  a: string
  e: number
}

function hashValue(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function stableHash(value: unknown) {
  return hashValue(JSON.stringify(value))
}

function decimal(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new ReferralAnalyticsError("INVALID_INPUT", "Некорректная денежная сумма.")
  return parsed.toFixed(2)
}

function normalizeItems(items: AnalyticsItemInput[]) {
  return items.map((item) => {
    if (!item.legacyProductId && !item.legacyProductGuid) {
      throw new ReferralAnalyticsError("INVALID_INPUT", "Укажите Legacy product ID или GUID.")
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      throw new ReferralAnalyticsError("INVALID_INPUT", "Некорректное количество товара.")
    }
    return {
      legacyProductId: item.legacyProductId ?? null,
      legacyProductGuid: item.legacyProductGuid ?? null,
      quantity: item.quantity,
      unitPrice: decimal(item.unitPrice),
      lineTotal: decimal(item.lineTotal),
      currency: "MDL" as const,
    }
  })
}

function parseOccurredAt(value: string, maxFutureMs = 60_000) {
  const occurredAt = new Date(value)
  if (Number.isNaN(occurredAt.getTime())) throw new ReferralAnalyticsError("INVALID_INPUT", "Некорректное время события.")
  if (occurredAt.getTime() > Date.now() + maxFutureMs) {
    throw new ReferralAnalyticsError("INVALID_INPUT", "Время события не может быть в будущем.")
  }
  return occurredAt
}

function isStaleOrderEvent(current: { status: string | null; occurredAt: Date } | undefined, nextStatus: string, nextOccurredAt: Date) {
  if (!current) return false
  const nextRank = orderStatusRank[nextStatus] ?? 0
  const currentRank = orderStatusRank[current.status ?? ""] ?? 0
  return (
    (current.status === "cancelled" && nextStatus !== "cancelled") ||
    (nextStatus !== current.status && nextOccurredAt.getTime() <= current.occurredAt.getTime()) ||
    (nextStatus !== current.status && nextRank < currentRank)
  )
}

export function createAttributionContext(attributionId: string, expiresAt: Date) {
  const payload: ContextPayload = { v: 1, a: attributionId, e: expiresAt.getTime() }
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  const unsigned = `${CONTEXT_VERSION}.${encoded}`
  const signature = createHmac("sha256", getApiEnv().BETTER_AUTH_SECRET).update(unsigned, "utf8").digest("base64url")
  return `${unsigned}.${signature}`
}

export function verifyAttributionContext(value: string): ContextPayload {
  const parts = value.split(".")
  if (parts.length !== 3 || parts[0] !== CONTEXT_VERSION || !/^[A-Za-z0-9_-]+$/.test(parts[1] ?? "") || !/^[A-Za-z0-9_-]+$/.test(parts[2] ?? "")) {
    throw new ReferralAnalyticsError("ATTRIBUTION_INVALID", "Attribution context is invalid.")
  }
  const unsigned = `${parts[0]}.${parts[1]}`
  const expected = createHmac("sha256", getApiEnv().BETTER_AUTH_SECRET).update(unsigned, "utf8").digest("base64url")
  const expectedBytes = Buffer.from(expected, "base64url")
  const providedBytes = Buffer.from(parts[2]!, "base64url")
  if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
    throw new ReferralAnalyticsError("ATTRIBUTION_INVALID", "Attribution context is invalid.")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"))
  } catch {
    throw new ReferralAnalyticsError("ATTRIBUTION_INVALID", "Attribution context is invalid.")
  }
  if (!parsed || typeof parsed !== "object") throw new ReferralAnalyticsError("ATTRIBUTION_INVALID", "Attribution context is invalid.")
  const payload = parsed as Partial<ContextPayload>
  if (payload.v !== 1 || typeof payload.a !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.a) || typeof payload.e !== "number" || !Number.isSafeInteger(payload.e)) {
    throw new ReferralAnalyticsError("ATTRIBUTION_INVALID", "Attribution context is invalid.")
  }
  if (payload.e <= Date.now()) throw new ReferralAnalyticsError("ATTRIBUTION_EXPIRED", "Attribution context has expired.")
  return payload as ContextPayload
}

export async function getAttributionFromContext(context: string, occurredAt: Date) {
  const payload = verifyAttributionContext(context)
  if (occurredAt.getTime() > payload.e) throw new ReferralAnalyticsError("ATTRIBUTION_EXPIRED", "Attribution context has expired.")

  const rows = await getDb()
    .select({ attribution: referralAttributions, link: referralLinks, partner: partners })
    .from(referralAttributions)
    .innerJoin(referralLinks, eq(referralAttributions.referralLinkId, referralLinks.id))
    .innerJoin(partners, eq(referralAttributions.partnerId, partners.id))
    .where(eq(referralAttributions.id, payload.a))
    .limit(1)
  const row = rows[0]
  if (!row || !isReferralAnalyticsPartnerAllowed(row.partner.id) || row.attribution.revokedAt || row.attribution.expiresAt.getTime() <= occurredAt.getTime() || row.link.status !== "active" || row.partner.type !== "creator" || row.partner.status !== "active") {
    throw new ReferralAnalyticsError("ATTRIBUTION_INVALID", "Attribution context is not valid.")
  }
  return row
}

export async function createAttributionForResolvedLink(result: ActiveReferralLink, visitKey: string | null) {
  const now = new Date()
  const visitKeyHash = visitKey ? hashValue(visitKey) : null
  return getDb().transaction(async (tx) => {
    if (visitKeyHash) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`referral-visit:${result.link.id}:${visitKeyHash}`}))`)
      const existingRows = await tx
        .select()
        .from(referralAttributions)
        .where(and(
          eq(referralAttributions.referralLinkId, result.link.id),
          eq(referralAttributions.visitKeyHash, visitKeyHash),
          isNull(referralAttributions.revokedAt),
          gt(referralAttributions.expiresAt, now),
          gt(referralAttributions.createdAt, new Date(now.getTime() - REFERRAL_VISIT_DEDUP_WINDOW_MS)),
        ))
        .orderBy(desc(referralAttributions.createdAt))
        .limit(1)
      if (existingRows[0]) return { attribution: existingRows[0], handoffToken: null, created: false }
      await tx.update(referralAttributions)
        .set({ revokedAt: now })
        .where(and(
          eq(referralAttributions.visitKeyHash, visitKeyHash),
          isNull(referralAttributions.revokedAt),
          gt(referralAttributions.expiresAt, now),
        ))
    }

    const handoffToken = randomBytes(32).toString("base64url")
    const expiresAt = new Date(now.getTime() + ATTRIBUTION_WINDOW_MS)
    const rows = await tx.insert(referralAttributions).values({
      tokenHash: hashValue(handoffToken),
      referralLinkId: result.link.id,
      partnerId: result.link.partnerId,
      visitKeyHash,
      createdAt: now,
      expiresAt,
    }).returning()
    const attribution = rows[0]
    if (!attribution) throw new Error("Attribution creation failed")
    return { attribution, handoffToken, created: true }
  })
}

export function addAttributionHandoff(targetUrl: string, handoffToken: string) {
  const url = new URL(targetUrl)
  url.searchParams.set("vp_attribution", handoffToken)
  return url.toString()
}

export async function exchangeAttributionHandoff(handoffToken: string) {
  if (!/^[A-Za-z0-9_-]{40,}$/.test(handoffToken)) throw new ReferralAnalyticsError("ATTRIBUTION_INVALID", "Attribution handoff is invalid.")
  const allowedPartnerIds = getApiEnv().REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS
  if (!allowedPartnerIds.length) throw new ReferralAnalyticsError("ATTRIBUTION_INVALID", "Attribution handoff is invalid or unavailable.")
  const now = new Date()
  const rows = await getDb().transaction(async (tx) => tx
    .update(referralAttributions)
    .set({ consumedAt: now })
    .where(and(
      eq(referralAttributions.tokenHash, hashValue(handoffToken)),
      inArray(referralAttributions.partnerId, allowedPartnerIds),
      isNull(referralAttributions.consumedAt),
      isNull(referralAttributions.revokedAt),
      gt(referralAttributions.expiresAt, now),
      exists(getDb().select({ one: sql`1` }).from(referralLinks).where(and(
        eq(referralLinks.id, referralAttributions.referralLinkId),
        eq(referralLinks.status, "active"),
      ))),
      exists(getDb().select({ one: sql`1` }).from(partners).where(and(
        eq(partners.id, referralAttributions.partnerId),
        eq(partners.type, "creator"),
        eq(partners.status, "active"),
      ))),
    ))
    .returning())
  const attribution = rows[0]
  if (!attribution) throw new ReferralAnalyticsError("ATTRIBUTION_INVALID", "Attribution handoff is invalid or already consumed.")
  return {
    attributionContext: createAttributionContext(attribution.id, attribution.expiresAt),
    expiresAt: attribution.expiresAt.toISOString(),
  }
}

async function insertEvent(input: {
  eventId: string
  dedupeKey: string
  payloadHash: string
  eventName: "add_to_cart" | "order.created" | "order.updated" | "order.confirmed" | "order.cancelled"
  attributionId: string
  referralLinkId: string
  partnerId: string
  source: "browser" | "legacy"
  legacyOrderId?: string
  status?: string
  occurredAt: Date
  metadata: Record<string, string>
  items: ReturnType<typeof normalizeItems>
}) {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`referral-event:${input.eventId}`}))`)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`referral-dedupe:${input.dedupeKey}`}))`)

    const existingByEvent = await tx.select().from(referralAnalyticsEvents).where(eq(referralAnalyticsEvents.eventId, input.eventId)).limit(1)
    if (existingByEvent[0]) {
      if (existingByEvent[0].payloadHash !== input.payloadHash) throw new ReferralAnalyticsError("IDEMPOTENCY_CONFLICT", "Event ID уже использован с другим payload.")
      return { kind: "idempotent" as const, event: existingByEvent[0] }
    }

    const existingByDedupe = await tx.select().from(referralAnalyticsEvents).where(eq(referralAnalyticsEvents.dedupeKey, input.dedupeKey)).limit(1)
    if (existingByDedupe[0]) {
      if (existingByDedupe[0].payloadHash === input.payloadHash) {
        return { kind: "idempotent" as const, event: existingByDedupe[0] }
      }
    }

    if (input.legacyOrderId && input.status) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`referral-order:${input.legacyOrderId}`}))`)
      const currentRows = await tx
        .select({ status: referralAnalyticsEvents.status, occurredAt: referralAnalyticsEvents.occurredAt })
        .from(referralAnalyticsEvents)
        .where(and(
          eq(referralAnalyticsEvents.legacyOrderId, input.legacyOrderId),
          inArray(referralAnalyticsEvents.eventName, ["order.created", "order.updated", "order.confirmed", "order.cancelled"]),
        ))
        .orderBy(desc(referralAnalyticsEvents.occurredAt), desc(referralAnalyticsEvents.receivedAt))
        .limit(1)
      if (isStaleOrderEvent(currentRows[0], input.status, input.occurredAt)) {
        throw new ReferralAnalyticsError("ORDER_EVENT_STALE", "Событие заказа устарело и не изменило состояние.")
      }
    }

    if (existingByDedupe[0]) {
      throw new ReferralAnalyticsError("IDEMPOTENCY_CONFLICT", "Событие уже обработано с другими данными.")
    }

    const now = new Date()
    const eventRows = await tx.insert(referralAnalyticsEvents).values({
      eventId: input.eventId,
      dedupeKey: input.dedupeKey,
      payloadHash: input.payloadHash,
      eventName: input.eventName,
      attributionId: input.attributionId,
      referralLinkId: input.referralLinkId,
      partnerId: input.partnerId,
      source: input.source,
      legacyOrderId: input.legacyOrderId,
      status: input.status,
      occurredAt: input.occurredAt,
      receivedAt: now,
      metadata: input.metadata,
    }).returning()
    const event = eventRows[0]
    if (!event) throw new Error("Referral analytics event creation failed")
    if (input.items.length) {
      await tx.insert(referralAnalyticsItems).values(input.items.map((item) => ({ ...item, eventId: event.id })))
    }
    return { kind: "created" as const, event }
  })
}

export async function ingestAddToCartEvent(input: AddToCartEventInput, source: "browser" | "legacy" = "browser") {
  const occurredAt = parseOccurredAt(input.occurredAt, 10 * 60_000)
  const attribution = await getAttributionFromContext(input.attributionContext, occurredAt)
  const items = normalizeItems(input.items)
  const payloadHash = stableHash({ eventName: "add_to_cart", attributionId: attribution.attribution.id, occurredAt: occurredAt.toISOString(), items })
  return insertEvent({
    eventId: input.eventId,
    dedupeKey: `${source}:${input.eventId}`,
    payloadHash,
    eventName: "add_to_cart",
    attributionId: attribution.attribution.id,
    referralLinkId: attribution.link.id,
    partnerId: attribution.partner.id,
    source,
    occurredAt,
    metadata: {},
    items,
  })
}

export async function ingestLegacyOrderEvent(input: LegacyOrderEventInput) {
  const occurredAt = parseOccurredAt(input.occurredAt, 5 * 60_000)
  if (input.eventType === "order.created" && input.status !== "new") throw new ReferralAnalyticsError("INVALID_INPUT", "order.created должен иметь статус new.")
  if (input.eventType === "order.confirmed" && input.status !== "confirmed") throw new ReferralAnalyticsError("INVALID_INPUT", "order.confirmed должен иметь статус confirmed.")
  if (input.eventType === "order.cancelled" && input.status !== "cancelled") throw new ReferralAnalyticsError("INVALID_INPUT", "order.cancelled должен иметь статус cancelled.")
  const attribution = await getAttributionFromContext(input.attributionContext, occurredAt)
  const items = normalizeItems(input.items)
  const payloadHash = stableHash({
    eventName: input.eventType,
    attributionId: attribution.attribution.id,
    orderId: input.orderId,
    status: input.status,
    amount: input.amount,
    currency: input.currency,
    occurredAt: occurredAt.toISOString(),
    items,
  })
  return insertEvent({
    eventId: input.eventId,
    dedupeKey: `order:${input.orderId}:${input.status}`,
    payloadHash,
    eventName: input.eventType,
    attributionId: attribution.attribution.id,
    referralLinkId: attribution.link.id,
    partnerId: attribution.partner.id,
    source: "legacy",
    legacyOrderId: input.orderId,
    status: input.status,
    occurredAt,
    metadata: { amount: input.amount, currency: input.currency },
    items,
  })
}

type AnalyticsMetric = {
  linkId: string
  code: string
  label: string
  clicks: number
  addToCart: number
  createdOrders: number
  confirmedOrders: number
  cancelledOrders: number
  revenueMdl: number
}

function createMetric(link: typeof referralLinks.$inferSelect): AnalyticsMetric {
  return { linkId: link.id, code: link.code, label: link.label, clicks: 0, addToCart: 0, createdOrders: 0, confirmedOrders: 0, cancelledOrders: 0, revenueMdl: 0 }
}

function conversionRate(clicks: number, orders: number) {
  return clicks === 0 ? 0 : Number(((orders / clicks) * 100).toFixed(2))
}

export async function getCreatorReferralAnalytics(partnerId: string, linkId?: string) {
  const linkRows = await getDb().select().from(referralLinks).where(linkId
    ? and(eq(referralLinks.partnerId, partnerId), eq(referralLinks.id, linkId))
    : eq(referralLinks.partnerId, partnerId))
  if (linkId && !linkRows[0]) return null
  const linkIds = linkRows.map((link) => link.id)
  const metrics = new Map(linkRows.map((link) => [link.id, createMetric(link)]))
  if (!linkIds.length) return { summary: { clicks: 0, addToCart: 0, createdOrders: 0, confirmedOrders: 0, cancelledOrders: 0, revenueMdl: "0.00", conversionRate: 0 }, links: [] }

  const [oldClickRows, attributionRows, events] = await Promise.all([
    getDb().select({ linkId: referralLinkClicks.referralLinkId, count: sql<number>`count(*)::int` }).from(referralLinkClicks).where(and(
      eq(referralLinkClicks.partnerId, partnerId),
      isNull(referralLinkClicks.attributionId),
      inArray(referralLinkClicks.referralLinkId, linkIds),
    )).groupBy(referralLinkClicks.referralLinkId),
    getDb().select({ linkId: referralAttributions.referralLinkId, count: sql<number>`count(*)::int` }).from(referralAttributions).where(inArray(referralAttributions.referralLinkId, linkIds)).groupBy(referralAttributions.referralLinkId),
    getDb().select().from(referralAnalyticsEvents).where(inArray(referralAnalyticsEvents.referralLinkId, linkIds)).orderBy(desc(referralAnalyticsEvents.occurredAt)),
  ])
  for (const row of oldClickRows) metrics.get(row.linkId)!.clicks += Number(row.count)
  for (const row of attributionRows) metrics.get(row.linkId)!.clicks += Number(row.count)

  const latestOrders = new Map<string, typeof events[number]>()
  for (const event of events) {
    const metric = event.referralLinkId ? metrics.get(event.referralLinkId) : undefined
    if (event.eventName === "add_to_cart") {
      if (metric) metric.addToCart += 1
      continue
    }
    if (!event.legacyOrderId) continue
    if (event.eventName === "order.created" && metric) metric.createdOrders += 1
    const current = latestOrders.get(event.legacyOrderId)
    if (!current || event.occurredAt > current.occurredAt || (event.occurredAt.getTime() === current.occurredAt.getTime() && event.receivedAt > current.receivedAt)) {
      latestOrders.set(event.legacyOrderId, event)
    }
  }
  for (const event of latestOrders.values()) {
    const metric = event.referralLinkId ? metrics.get(event.referralLinkId) : undefined
    if (!metric) continue
    if (event.status === "cancelled") metric.cancelledOrders += 1
    if (event.status && confirmedStatuses.has(event.status)) {
      metric.confirmedOrders += 1
      metric.revenueMdl += Number((event.metadata as { amount?: string })?.amount ?? 0)
    }
  }

  const breakdown = [...metrics.values()].map((metric) => ({
    ...metric,
    revenueMdl: metric.revenueMdl.toFixed(2),
    conversionRate: conversionRate(metric.clicks, metric.confirmedOrders),
  }))
  const summary = breakdown.reduce((result, metric) => ({
    clicks: result.clicks + metric.clicks,
    addToCart: result.addToCart + metric.addToCart,
    createdOrders: result.createdOrders + metric.createdOrders,
    confirmedOrders: result.confirmedOrders + metric.confirmedOrders,
    cancelledOrders: result.cancelledOrders + metric.cancelledOrders,
    revenueMdl: result.revenueMdl + Number(metric.revenueMdl),
  }), { clicks: 0, addToCart: 0, createdOrders: 0, confirmedOrders: 0, cancelledOrders: 0, revenueMdl: 0 })
  return {
    summary: { ...summary, revenueMdl: summary.revenueMdl.toFixed(2), conversionRate: conversionRate(summary.clicks, summary.confirmedOrders) },
    links: breakdown,
  }
}
