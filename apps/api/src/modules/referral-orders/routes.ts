import { referralOrderEventV1Schema } from "@vizaje/contracts"
import { Hono } from "hono"
import type { ApiEnv } from "../../auth/middleware"
import { apiError } from "../../http/errors"
import { requireFeature } from "../../http/feature-flags"
import { ingestReferralOrderEvent } from "./service"

export const internalReferralOrderRoutes = new Hono<ApiEnv>()

internalReferralOrderRoutes.post("/events", requireFeature("REFERRAL_TRACKING_ENABLED"), async (c) => {
  let payload: unknown
  try { payload = await c.req.json() } catch { return apiError(c, 400, "INVALID_JSON", "Некорректное событие заказа.") }
  const parsed = referralOrderEventV1Schema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Некорректное событие заказа.", parsed.error.flatten().fieldErrors)
  const result = await ingestReferralOrderEvent(parsed.data)
  if (result.kind === "invalid_event") return apiError(c, 400, "INVALID_EVENT", "Некорректная дата события.")
  if (result.kind === "link_not_found") return apiError(c, 404, "REFERRAL_LINK_NOT_FOUND", "Referral link не найдена.")
  if (result.kind === "order_not_found") return apiError(c, 404, "ORDER_NOT_FOUND", "Заказ для обновления не найден.")
  if (result.kind === "order_binding_conflict") return apiError(c, 409, "ORDER_BINDING_CONFLICT", "Заказ уже привязан к другому креатору, ссылке или валюте.")
  return c.json({ idempotent: result.kind === "idempotent", orderId: result.id ?? result.order.id })
})
