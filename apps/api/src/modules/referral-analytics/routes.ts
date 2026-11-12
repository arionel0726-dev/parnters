import { Hono } from "hono"
import { z } from "zod"
import { requireAuth, requirePartner, type ApiEnv } from "../../auth/middleware"
import { getApiEnv } from "../../env"
import { requireLegacyAnalyticsHmac } from "../account-linking/service-auth"
import { requireFeature } from "../../http/feature-flags"
import { apiError } from "../../http/errors"
import { rateLimit } from "../../http/rate-limit"
import {
  exchangeAttributionHandoff,
  getCreatorReferralAnalytics,
  ingestAddToCartEvent,
  ingestLegacyOrderEvent,
  ReferralAnalyticsError,
} from "./service"

const productId = z.string().trim().min(1).max(128).optional().nullable()
const publicItemSchema = z.object({
  legacyProductId: productId,
  legacyProductGuid: productId,
  quantity: z.number().int().min(1).max(99),
  unitPrice: z.number().finite().min(0).max(100_000_000).optional().nullable(),
  lineTotal: z.number().finite().min(0).max(100_000_000).optional().nullable(),
}).strict().refine((item) => Boolean(item.legacyProductId || item.legacyProductGuid), "Укажите Legacy product ID или GUID.")

const publicEventSchema = z.object({
  eventId: z.string().uuid(),
  eventName: z.literal("add_to_cart"),
  attributionContext: z.string().min(60).max(512),
  occurredAt: z.iso.datetime(),
  items: z.array(publicItemSchema).min(1).max(20),
}).strict()

const handoffSchema = z.object({
  handoffToken: z.string().regex(/^[A-Za-z0-9_-]{40,}$/),
}).strict()

const decimalString = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/)
const legacyItemSchema = z.object({
  legacyProductId: productId,
  legacyProductGuid: productId,
  quantity: z.number().int().min(1).max(99),
  unitPrice: decimalString.nullable().optional(),
  lineTotal: decimalString.nullable().optional(),
}).strict().refine((item) => Boolean(item.legacyProductId || item.legacyProductGuid), "Укажите Legacy product ID или GUID.")

const legacyOrderEventSchema = z.object({
  eventId: z.string().uuid(),
  eventVersion: z.literal("v1"),
  eventType: z.enum(["order.created", "order.updated", "order.confirmed", "order.cancelled"]),
  orderId: z.string().trim().min(1).max(128),
  attributionContext: z.string().min(60).max(512),
  status: z.enum(["new", "progress", "paid", "confirmed", "finished", "cancelled"]),
  amount: decimalString,
  currency: z.literal("MDL"),
  occurredAt: z.iso.datetime(),
  items: z.array(legacyItemSchema).min(1).max(100),
}).strict()

function handleAnalyticsError(c: Parameters<typeof apiError>[0], error: unknown) {
  if (!(error instanceof ReferralAnalyticsError)) throw error
  const status = error.code === "IDEMPOTENCY_CONFLICT" ? 409
    : error.code === "ORDER_EVENT_STALE" ? 409
      : error.code === "ATTRIBUTION_EXPIRED" ? 410
        : 400
  return apiError(c, status, error.code, error.message)
}

export const publicReferralAnalyticsRoutes = new Hono<ApiEnv>()
publicReferralAnalyticsRoutes.use("/events", requireFeature("REFERRAL_ANALYTICS_ENABLED"))
publicReferralAnalyticsRoutes.use("/events", rateLimit((c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown"
  return `referral-analytics:${ip}`
}, 120, 60_000))

publicReferralAnalyticsRoutes.post("/events", async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Некорректное событие.")
  }
  const parsed = publicEventSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Некорректное событие.", parsed.error.flatten().fieldErrors)
  try {
    const result = await ingestAddToCartEvent(parsed.data)
    return c.json({ eventId: result.event.eventId, idempotent: result.kind === "idempotent" }, result.kind === "idempotent" ? 200 : 202)
  } catch (error) {
    return handleAnalyticsError(c, error)
  }
})

export const internalReferralAnalyticsRoutes = new Hono<ApiEnv>()
internalReferralAnalyticsRoutes.use("*", requireFeature("REFERRAL_ANALYTICS_ENABLED"), requireLegacyAnalyticsHmac)
internalReferralAnalyticsRoutes.use("/attribution/exchange", rateLimit("legacy-referral-analytics-exchange", 120, 60_000))
internalReferralAnalyticsRoutes.use("/events", rateLimit("legacy-referral-analytics-events", 600, 60_000))
internalReferralAnalyticsRoutes.use("/order-events", rateLimit("legacy-referral-analytics-events", 600, 60_000))

internalReferralAnalyticsRoutes.post("/attribution/exchange", async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Некорректный handoff.")
  }
  const parsed = handoffSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Некорректный handoff.")
  try {
    return c.json(await exchangeAttributionHandoff(parsed.data.handoffToken))
  } catch (error) {
    return handleAnalyticsError(c, error)
  }
})

internalReferralAnalyticsRoutes.post("/events", async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Некорректное событие.")
  }
  const parsed = publicEventSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Некорректное событие.", parsed.error.flatten().fieldErrors)
  try {
    const result = await ingestAddToCartEvent(parsed.data, "legacy")
    return c.json({ eventId: result.event.eventId, idempotent: result.kind === "idempotent" }, result.kind === "idempotent" ? 200 : 202)
  } catch (error) {
    return handleAnalyticsError(c, error)
  }
})

internalReferralAnalyticsRoutes.post("/order-events", async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Некорректное событие заказа.")
  }
  const parsed = legacyOrderEventSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Некорректное событие заказа.", parsed.error.flatten().fieldErrors)
  try {
    const result = await ingestLegacyOrderEvent(parsed.data)
    return c.json({ eventId: result.event.eventId, idempotent: result.kind === "idempotent" }, result.kind === "idempotent" ? 200 : 202)
  } catch (error) {
    return handleAnalyticsError(c, error)
  }
})

export const creatorReferralAnalyticsRoutes = new Hono<ApiEnv>()
creatorReferralAnalyticsRoutes.use("*", requireAuth, requirePartner)
creatorReferralAnalyticsRoutes.get("/analytics", async (c, next) => {
  // `/v1/partner/analytics` was already used by the M4 finance module.
  // Let the older route handle it while referral analytics is disabled.
  if (!getApiEnv().REFERRAL_ANALYTICS_ENABLED) return next()
  const analytics = await getCreatorReferralAnalytics(c.get("partner").id)
  return c.json(analytics)
})

creatorReferralAnalyticsRoutes.get("/referral-links/:id/analytics", requireFeature("REFERRAL_ANALYTICS_ENABLED"), async (c) => {
  const analytics = await getCreatorReferralAnalytics(c.get("partner").id, c.req.param("id"))
  if (!analytics) return apiError(c, 404, "REFERRAL_LINK_NOT_FOUND", "Referral link не найдена.")
  return c.json(analytics)
})
