import { Hono } from "hono"
import type { ApiEnv } from "../../auth/middleware"
import { requireAuth, requirePartner, requirePermission } from "../../auth/middleware"
import { apiError } from "../../http/errors"
import { requireFeature } from "../../http/feature-flags"
import { getCreatorFinance, listAdminPayouts, requestPayout, updatePayoutStatus } from "./repository"

function dateRange(search: URLSearchParams) {
  const fromValue = search.get("from")
  const toValue = search.get("to")
  const from = fromValue ? new Date(`${fromValue}T00:00:00.000Z`) : undefined
  const to = toValue ? new Date(`${toValue}T23:59:59.999Z`) : undefined
  return {
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined,
  }
}

export const creatorFinanceRoutes = new Hono<ApiEnv>()
creatorFinanceRoutes.use("*", requireAuth, requirePartner)

creatorFinanceRoutes.get("/analytics", requireFeature("CREATOR_FINANCE_ENABLED"), requireFeature("REFERRAL_TRACKING_ENABLED"), async (c) => c.json(await getCreatorFinance(c.get("partner").id, dateRange(new URL(c.req.url).searchParams))))
creatorFinanceRoutes.get("/orders", requireFeature("CREATOR_FINANCE_ENABLED"), requireFeature("REFERRAL_TRACKING_ENABLED"), async (c) => {
  const result = await getCreatorFinance(c.get("partner").id, dateRange(new URL(c.req.url).searchParams))
  return c.json({ summary: result.summary, orders: result.orders })
})
creatorFinanceRoutes.get("/payouts", requireFeature("CREATOR_FINANCE_ENABLED"), requireFeature("PAYOUTS_ENABLED"), async (c) => {
  const result = await getCreatorFinance(c.get("partner").id)
  return c.json({ summary: result.summary, payouts: result.payouts })
})
creatorFinanceRoutes.post("/payouts", requireFeature("CREATOR_FINANCE_ENABLED"), requireFeature("PAYOUTS_ENABLED"), async (c) => {
  let payload: unknown
  try { payload = await c.req.json() } catch { return apiError(c, 400, "INVALID_JSON", "Укажите сумму выплаты.") }
  const body = payload as { amount?: unknown; currency?: unknown }
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount)
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : ""
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || !/^[A-Z]{3}$/.test(currency)) return apiError(c, 400, "VALIDATION_ERROR", "Укажите корректную сумму и валюту.")
  const idempotencyKey = c.req.header("Idempotency-Key")?.trim() ?? ""
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) return apiError(c, 400, "IDEMPOTENCY_KEY_REQUIRED", "Повторите запрос с ключом идемпотентности.")
  const result = await requestPayout(c.get("partner").id, amount, currency, idempotencyKey)
  if (result.kind === "not_eligible") return apiError(c, 403, "PARTNER_ACCESS_REQUIRED", "Выплата доступна только активному креатору.")
  if (result.kind === "insufficient_balance") return apiError(c, 409, "INSUFFICIENT_BALANCE", "Недостаточно доступного баланса для выплаты.", { available: result.available })
  if (result.kind === "idempotency_conflict") return apiError(c, 409, "IDEMPOTENCY_KEY_CONFLICT", "Этот ключ уже использован для другого запроса.")
  return c.json({ payout: result.payout, idempotent: result.kind === "idempotent" }, result.kind === "idempotent" ? 200 : 201)
})

export const adminFinanceRoutes = new Hono<ApiEnv>()
adminFinanceRoutes.get("/payouts", requirePermission("finance:read"), requireFeature("PAYOUTS_ENABLED"), async (c) => {
  const status = c.req.query("status")
  const validStatus = status === "requested" || status === "approved" || status === "paid" || status === "rejected" || status === "cancelled" ? status : undefined
  return c.json({ payouts: await listAdminPayouts(validStatus) })
})
adminFinanceRoutes.patch("/payouts/:id/status", requirePermission("finance:write"), requireFeature("PAYOUTS_ENABLED"), async (c) => {
  let payload: unknown
  try { payload = await c.req.json() } catch { return apiError(c, 400, "INVALID_JSON", "Укажите статус выплаты.") }
  const body = payload as { status?: unknown; reason?: unknown }
  const status = body.status
  if (status !== "approved" && status !== "paid" && status !== "rejected" && status !== "cancelled") return apiError(c, 400, "VALIDATION_ERROR", "Некорректный статус выплаты.")
  const reason = typeof body.reason === "string" ? body.reason : null
  const result = await updatePayoutStatus(c.req.param("id"), status, reason, c.get("auth").user.id)
  if (result.kind === "not_found") return apiError(c, 404, "PAYOUT_NOT_FOUND", "Выплата не найдена.")
  if (result.kind === "invalid_transition") return apiError(c, 409, "PAYOUT_INVALID_TRANSITION", "Этот переход статуса недоступен.")
  if (result.kind === "reason_required") return apiError(c, 400, "REASON_REQUIRED", "Укажите причину отказа.")
  return c.json({ payout: result.payout, idempotent: result.kind === "unchanged" })
})
