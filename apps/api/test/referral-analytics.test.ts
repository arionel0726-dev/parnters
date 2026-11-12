import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash, createHmac, randomBytes } from "node:crypto"
import { hashPassword } from "better-auth/crypto"
import { desc, eq, inArray } from "drizzle-orm"
import {
  apiRateLimits,
  auditLogs,
  authAccounts,
  authSessions,
  getDb,
  partnerAccounts,
  partners,
  referralAnalyticsEvents,
  referralAttributions,
  referralLinkClicks,
  referralOrders,
  referralLinks,
  users,
} from "@vizaje/db"

const previousFeatureFlags = {
  analytics: process.env.REFERRAL_ANALYTICS_ENABLED,
  allowedPartners: process.env.REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS,
  tracking: process.env.REFERRAL_TRACKING_ENABLED,
  finance: process.env.CREATOR_FINANCE_ENABLED,
  payouts: process.env.PAYOUTS_ENABLED,
}
const analyticsKeyId = `legacy-analytics-to-partners-test-${crypto.randomUUID()}`
const analyticsSecret = randomBytes(32).toString("base64url")
process.env.LEGACY_ANALYTICS_HMAC_KEYS = JSON.stringify([{ keyId: analyticsKeyId, secret: analyticsSecret, active: true }])

const { app } = await import("../src/index")
const { buildAccountLinkCanonicalString } = await import("../src/modules/account-linking/service-auth")
const { createAttributionContext } = await import("../src/modules/referral-analytics/service")

const db = getDb()
const serviceToken = process.env.REFERRAL_SERVICE_TOKEN ?? "vizaje-referral-service-local-development-token-2026"
const partnerId = crypto.randomUUID()
const linkId = crypto.randomUUID()
const creatorUserId = crypto.randomUUID()
const creatorEmail = `analytics-creator-${creatorUserId}@vizaje.local`
const creatorPassword = "analytics-creator-password-2026"
const testCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const code = `AN${Array.from(randomBytes(8), (value) => testCodeAlphabet[value % testCodeAlphabet.length]).join("")}`
const visitKey = crypto.randomUUID()
let handoffToken = ""
let attributionContext = ""
let creatorCookie = ""

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost:3001${path}`, init))
}

function sessionCookie(response: Response) {
  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  const cookie = setCookies.find((value) => value.startsWith("better-auth.session_token=")) ?? response.headers.get("set-cookie")
  if (!cookie) throw new Error("Expected a session cookie")
  return cookie.split(";", 1)[0]
}

async function loginCreator() {
  const response = await request("/v1/auth/sign-in/email", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ email: creatorEmail, password: creatorPassword }),
  })
  expect(response.status).toBe(200)
  return sessionCookie(response)
}

function signLegacyRequest(path: string, body: unknown, nonce = randomBytes(16).toString("base64url")) {
  const rawBody = JSON.stringify(body)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const canonical = buildAccountLinkCanonicalString({
    keyId: analyticsKeyId,
    method: "POST",
    pathAndQuery: path,
    timestamp,
    nonce,
    rawBody,
  })
  const signature = createHmac("sha256", Buffer.from(analyticsSecret, "base64url")).update(canonical, "utf8").digest("hex")
  return request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vp-key-id": analyticsKeyId,
      "x-vp-timestamp": timestamp,
      "x-vp-nonce": nonce,
      "x-vp-signature": signature,
    },
    body: rawBody,
  })
}

beforeAll(async () => {
  process.env.REFERRAL_ANALYTICS_ENABLED = "true"
  process.env.REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS = partnerId
  process.env.REFERRAL_TRACKING_ENABLED = "false"
  process.env.CREATOR_FINANCE_ENABLED = "false"
  process.env.PAYOUTS_ENABLED = "false"
  const now = new Date()
  await db.insert(partners).values({
    id: partnerId,
    creatorId: "CRE-ANALYTICS-TEST",
    displayName: "Analytics Test Creator",
    email: `analytics-${partnerId}@vizaje.local`,
    type: "creator",
    status: "active",
    tier: "starter",
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(users).values({
    id: creatorUserId,
    email: creatorEmail,
    name: "Analytics Creator",
    emailVerified: true,
    role: "analyst",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(authAccounts).values({
    id: crypto.randomUUID(),
    accountId: creatorUserId,
    providerId: "credential",
    userId: creatorUserId,
    password: await hashPassword(creatorPassword),
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(partnerAccounts).values({ userId: creatorUserId, partnerId, createdAt: now, updatedAt: now })
  creatorCookie = await loginCreator()
  await db.insert(referralLinks).values({
    id: linkId,
    partnerId,
    code,
    label: "Analytics test link",
    targetProtocol: "https",
    targetHost: "vizaje-nica.com",
    targetPath: "/ro/",
    linkType: "homepage",
    status: "active",
    createdAt: now,
    updatedAt: now,
  })
})

afterAll(async () => {
  await db.delete(referralAnalyticsEvents).where(eq(referralAnalyticsEvents.partnerId, partnerId))
  await db.delete(referralAttributions).where(eq(referralAttributions.partnerId, partnerId))
  await db.delete(referralLinkClicks).where(eq(referralLinkClicks.partnerId, partnerId))
  await db.delete(auditLogs).where(eq(auditLogs.entityId, linkId))
  await db.delete(referralLinks).where(eq(referralLinks.id, linkId))
  await db.delete(partnerAccounts).where(eq(partnerAccounts.userId, creatorUserId))
  await db.delete(authSessions).where(eq(authSessions.userId, creatorUserId))
  await db.delete(authAccounts).where(eq(authAccounts.userId, creatorUserId))
  await db.delete(users).where(eq(users.id, creatorUserId))
  await db.delete(partners).where(eq(partners.id, partnerId))
  await db.delete(apiRateLimits).where(inArray(apiRateLimits.bucketKey, ["legacy-referral-analytics-events", "referral-analytics:unknown"]))
  for (const [name, value] of Object.entries(previousFeatureFlags)) {
    const envName = {
      analytics: "REFERRAL_ANALYTICS_ENABLED",
      allowedPartners: "REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS",
      tracking: "REFERRAL_TRACKING_ENABLED",
      finance: "CREATOR_FINANCE_ENABLED",
      payouts: "PAYOUTS_ENABLED",
    }[name as keyof typeof previousFeatureFlags]
    if (value === undefined) delete process.env[envName]
    else process.env[envName] = value
  }
})

describe("referral analytics backend", () => {
  test("creates a deduplicated attribution handoff without requiring tracking", async () => {
    const response = await request("/v1/internal/referral-links/click", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-service-token": serviceToken,
        "x-referral-visit-id": visitKey,
      },
      body: JSON.stringify({ code }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { valid: boolean; redirectUrl: string }
    expect(body.valid).toBe(true)
    const redirect = new URL(body.redirectUrl)
    handoffToken = redirect.searchParams.get("vp_attribution") ?? ""
    expect(handoffToken).toMatch(/^[A-Za-z0-9_-]{40,}$/)

    const second = await request("/v1/internal/referral-links/click", {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-token": serviceToken, "x-referral-visit-id": visitKey },
      body: JSON.stringify({ code }),
    })
    const secondBody = await second.json() as { redirectUrl: string }
    expect(new URL(secondBody.redirectUrl).searchParams.get("vp_attribution")).toBeNull()

    const attributions = await db.select().from(referralAttributions).where(eq(referralAttributions.partnerId, partnerId))
    expect(attributions).toHaveLength(1)
    expect(attributions[0]?.tokenHash).not.toBe(handoffToken)
    expect(attributions[0]?.visitKeyHash).toBe(createHash("sha256").update(visitKey).digest("hex"))
    expect(await db.select().from(referralLinkClicks).where(eq(referralLinkClicks.partnerId, partnerId))).toHaveLength(0)
  })

  test("exchanges the handoff once and rejects replay or invalid HMAC", async () => {
    const body = { handoffToken }
    const exchange = await signLegacyRequest("/v1/internal/referral-analytics/attribution/exchange", body)
    expect(exchange.status).toBe(200)
    const exchangeBody = await exchange.json() as { attributionContext: string; expiresAt: string }
    attributionContext = exchangeBody.attributionContext
    expect(attributionContext).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(new Date(exchangeBody.expiresAt).getTime()).toBeGreaterThan(Date.now())

    const replay = await signLegacyRequest("/v1/internal/referral-analytics/attribution/exchange", body)
    expect(replay.status).toBe(400)
    expect((await replay.json() as { error: { code: string } }).error.code).toBe("ATTRIBUTION_INVALID")

    const invalid = await request("/v1/internal/referral-analytics/attribution/exchange", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vp-key-id": analyticsKeyId, "x-vp-timestamp": String(Math.floor(Date.now() / 1000)), "x-vp-nonce": randomBytes(16).toString("base64url"), "x-vp-signature": "0".repeat(64) },
      body: JSON.stringify(body),
    })
    expect(invalid.status).toBe(401)
  })

  test("keeps analytics isolated to the configured test partner", async () => {
    const previousAllowedPartners = process.env.REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS
    process.env.REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS = crypto.randomUUID()
    try {
      const response = await request("/v1/internal/referral-links/click", {
        method: "POST",
        headers: { "content-type": "application/json", "x-service-token": serviceToken, "x-referral-visit-id": crypto.randomUUID() },
        body: JSON.stringify({ code }),
      })
      expect(response.status).toBe(200)
      const body = await response.json() as { redirectUrl: string }
      expect(new URL(body.redirectUrl).searchParams.get("vp_attribution")).toBeNull()
      expect(await db.select().from(referralAttributions).where(eq(referralAttributions.partnerId, partnerId))).toHaveLength(1)
    } finally {
      if (previousAllowedPartners === undefined) delete process.env.REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS
      else process.env.REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS = previousAllowedPartners
    }
  })

  test("rejects a handoff context after its partner leaves the allowlist", async () => {
    const previousAllowedPartners = process.env.REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS
    process.env.REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS = crypto.randomUUID()
    try {
      const response = await request("/v1/public/referral-analytics/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId: crypto.randomUUID(),
          eventName: "add_to_cart",
          attributionContext,
          occurredAt: new Date().toISOString(),
          items: [{ legacyProductId: "11048", quantity: 1 }],
        }),
      })
      expect(response.status).toBe(400)
      expect((await response.json() as { error: { code: string } }).error.code).toBe("ATTRIBUTION_INVALID")

      const orderResponse = await signLegacyRequest("/v1/internal/referral-analytics/order-events", {
        eventId: crypto.randomUUID(),
        eventVersion: "v1",
        eventType: "order.created",
        orderId: `allowlist-order-${crypto.randomUUID()}`,
        attributionContext,
        status: "new",
        amount: "1.00",
        currency: "MDL",
        occurredAt: new Date().toISOString(),
        items: [{ legacyProductId: "11048", quantity: 1, unitPrice: "1.00", lineTotal: "1.00" }],
      })
      expect(orderResponse.status).toBe(400)
      expect((await orderResponse.json() as { error: { code: string } }).error.code).toBe("ATTRIBUTION_INVALID")
    } finally {
      if (previousAllowedPartners === undefined) delete process.env.REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS
      else process.env.REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS = previousAllowedPartners
    }
  })

  test("rejects an attribution context after its seven-day TTL", async () => {
    const attributions = await db.select({ id: referralAttributions.id }).from(referralAttributions).where(eq(referralAttributions.partnerId, partnerId)).limit(1)
    const expiredContext = createAttributionContext(attributions[0]!.id, new Date(Date.now() - 1000))
    const response = await request("/v1/public/referral-analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        eventName: "add_to_cart",
        attributionContext: expiredContext,
        occurredAt: new Date().toISOString(),
        items: [{ legacyProductId: "11048", quantity: 1 }],
      }),
    })
    expect(response.status).toBe(410)
    expect((await response.json() as { error: { code: string } }).error.code).toBe("ATTRIBUTION_EXPIRED")
  })

  test("ingests add-to-cart idempotently and rejects conflicting payloads", async () => {
    const eventId = crypto.randomUUID()
    const body = {
      eventId,
      eventName: "add_to_cart",
      attributionContext,
      occurredAt: new Date().toISOString(),
      items: [{ legacyProductId: "11048", quantity: 1 }],
    }
    const first = await request("/v1/public/referral-analytics/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    expect(first.status).toBe(202)
    const repeated = await request("/v1/public/referral-analytics/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    expect(repeated.status).toBe(200)
    expect((await repeated.json() as { idempotent: boolean }).idempotent).toBe(true)
    const conflict = await request("/v1/public/referral-analytics/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, items: [{ legacyProductId: "11048", quantity: 2 }] }) })
    expect(conflict.status).toBe(409)
    expect((await conflict.json() as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_CONFLICT")

    const publicOrder = await request("/v1/public/referral-analytics/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, eventName: "order.created" }) })
    expect(publicOrder.status).toBe(400)

    const creatorAnalytics = await request("/v1/partner/analytics")
    expect(creatorAnalytics.status).toBe(401)
  })

  test("keeps order states separate and rejects stale transitions", async () => {
    const orderId = `analytics-order-${crypto.randomUUID()}`
    const base = {
      eventVersion: "v1",
      orderId,
      attributionContext,
      currency: "MDL",
      amount: "249.90",
      items: [{ legacyProductId: "11048", quantity: 1, unitPrice: "249.90", lineTotal: "249.90" }],
    }
    const createdAt = new Date(Date.now() - 2000).toISOString()
    const createdPayload = { ...base, eventId: crypto.randomUUID(), eventType: "order.created", status: "new", occurredAt: createdAt }
    const created = await signLegacyRequest("/v1/internal/referral-analytics/order-events", createdPayload)
    expect(created.status).toBe(202)
    const createdReplay = await signLegacyRequest("/v1/internal/referral-analytics/order-events", createdPayload)
    expect(createdReplay.status).toBe(200)
    expect((await createdReplay.json() as { idempotent: boolean }).idempotent).toBe(true)
    const confirmed = await signLegacyRequest("/v1/internal/referral-analytics/order-events", { ...base, eventId: crypto.randomUUID(), eventType: "order.confirmed", status: "confirmed", occurredAt: new Date(Date.now() - 1000).toISOString() })
    expect(confirmed.status).toBe(202)
    const cancelled = await signLegacyRequest("/v1/internal/referral-analytics/order-events", { ...base, eventId: crypto.randomUUID(), eventType: "order.cancelled", status: "cancelled", occurredAt: new Date().toISOString() })
    expect(cancelled.status).toBe(202)
    const stale = await signLegacyRequest("/v1/internal/referral-analytics/order-events", { ...base, eventId: crypto.randomUUID(), eventType: "order.confirmed", status: "confirmed", occurredAt: new Date(Date.now() - 10_000).toISOString() })
    expect(stale.status).toBe(409)
    expect((await stale.json() as { error: { code: string } }).error.code).toBe("ORDER_EVENT_STALE")

    const events = await db.select().from(referralAnalyticsEvents).where(eq(referralAnalyticsEvents.legacyOrderId, orderId)).orderBy(desc(referralAnalyticsEvents.occurredAt))
    expect(events.map((event) => event.eventName)).toEqual(["order.cancelled", "order.confirmed", "order.created"])
    expect(events.some((event) => event.status === "confirmed")).toBe(true)
    expect(events.find((event) => event.eventName === "order.created")?.metadata).toEqual({ amount: "249.90", currency: "MDL" })
    expect(await db.select().from(referralOrders).where(eq(referralOrders.orderId, orderId))).toHaveLength(0)

    const creatorAnalytics = await request("/v1/partner/analytics", { headers: { cookie: creatorCookie } })
    expect(creatorAnalytics.status).toBe(200)
    const creatorAnalyticsBody = await creatorAnalytics.json() as { summary: { clicks: number; addToCart: number; createdOrders: number; confirmedOrders: number; cancelledOrders: number; revenueMdl: string } }
    expect(creatorAnalyticsBody.summary).toMatchObject({ clicks: 1, addToCart: 1, createdOrders: 1, confirmedOrders: 0, cancelledOrders: 1, revenueMdl: "0.00" })
  })
})
