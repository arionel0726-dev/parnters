import { creatorActivationInputSchema, creatorApplicationInputSchema, applicationReviewInputSchema, applicationListQuerySchema } from "@vizaje/contracts"
import { Hono } from "hono"
import type { ApiEnv } from "../../auth/middleware"
import { requirePermission } from "../../auth/middleware"
import { apiError } from "../../http/errors"
import { getApplicationRecord, listApplications } from "./repository"
import {
  ApplicationConflictError,
  CreatorActivationError,
  activateCreatorAccount,
  approveCreatorApplication,
  consumeApplicationRateLimit,
  createCreatorApplication,
  rejectCreatorApplication,
  retryApplicationEmailDelivery,
  startCreatorApplicationReview,
} from "./service"

const publicApplications = new Hono<ApiEnv>()

function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown"
}

publicApplications.post("/", async (c) => {
  const ipAddress = requestIp(c.req.raw)
  if (!consumeApplicationRateLimit(`ip:${ipAddress}`)) {
    return apiError(c, 429, "RATE_LIMITED", "Слишком много заявок. Попробуйте позже.")
  }

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Проверьте данные формы.")
  }
  const parsed = creatorApplicationInputSchema.safeParse(payload)
  if (!parsed.success) {
    return apiError(c, 400, "VALIDATION_ERROR", "Проверьте поля формы.", parsed.error.flatten().fieldErrors)
  }

  try {
    await createCreatorApplication(parsed.data, ipAddress)
    return c.json({ submitted: true }, 201)
  } catch (error) {
    if (error instanceof ApplicationConflictError) {
      // Match the normal response so public submissions cannot enumerate pending or approved records.
      return c.json({ submitted: true }, 201)
    }
    throw error
  }
})

publicApplications.post("/activate", async (c) => {
  if (!consumeApplicationRateLimit(`activation:${requestIp(c.req.raw)}`)) {
    return apiError(c, 429, "RATE_LIMITED", "Слишком много попыток. Попробуйте позже.")
  }
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_ACTIVATION_LINK", "Ссылка активации недействительна или срок её действия истёк.")
  }
  const parsed = creatorActivationInputSchema.safeParse(payload)
  if (!parsed.success) {
    return apiError(c, 400, "INVALID_ACTIVATION_LINK", "Ссылка активации недействительна или срок её действия истёк.")
  }
  try {
    await activateCreatorAccount(parsed.data.token, parsed.data.password)
    return c.json({ activated: true })
  } catch (error) {
    if (error instanceof CreatorActivationError) {
      return apiError(c, 400, "INVALID_ACTIVATION_LINK", "Ссылка активации недействительна или срок её действия истёк.")
    }
    throw error
  }
})

export const applicationRoutes = publicApplications

export const adminApplicationRoutes = new Hono<ApiEnv>()

adminApplicationRoutes.get("/", requirePermission("applications:read"), async (c) => {
  const parsed = applicationListQuerySchema.safeParse({
    status: c.req.query("status"),
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
    search: c.req.query("search"),
  })
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Некорректные параметры списка.", parsed.error.flatten().fieldErrors)
  const result = await listApplications(parsed.data)
  return c.json({ ...result, page: parsed.data.page, pageSize: parsed.data.pageSize })
})

adminApplicationRoutes.get("/:id", requirePermission("applications:read"), async (c) => {
  const result = await getApplicationRecord(c.req.param("id"))
  if (!result) return apiError(c, 404, "APPLICATION_NOT_FOUND", "Заявка не найдена.")
  return c.json(result)
})

adminApplicationRoutes.post("/:id/start-review", requirePermission("applications:write"), async (c) => {
  const result = await startCreatorApplicationReview(c.req.param("id"), c.get("auth").user.id)
  if (result.kind === "not_found") return apiError(c, 404, "APPLICATION_NOT_FOUND", "Заявка не найдена.")
  return c.json({ idempotent: result.kind !== "started" })
})

adminApplicationRoutes.post("/:id/approve", requirePermission("applications:write"), async (c) => {
  const result = await approveCreatorApplication(c.req.param("id"), c.get("auth").user.id)
  if (result.kind === "not_found") return apiError(c, 404, "APPLICATION_NOT_FOUND", "Заявка не найдена.")
  if (result.kind === "conflict") return apiError(c, 409, "APPLICATION_STATE_CONFLICT", result.message)
  return c.json({ idempotent: result.kind === "already_approved", application: result.application, partner: "partner" in result ? result.partner : undefined })
})

adminApplicationRoutes.post("/:id/reject", requirePermission("applications:write"), async (c) => {
  let payload: unknown = {}
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Укажите причину отказа.")
  }
  const parsed = applicationReviewInputSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Укажите причину отказа.", parsed.error.flatten().fieldErrors)
  const result = await rejectCreatorApplication(c.req.param("id"), c.get("auth").user.id, parsed.data.reason)
  if (result.kind === "not_found") return apiError(c, 404, "APPLICATION_NOT_FOUND", "Заявка не найдена.")
  if (result.kind === "conflict") return apiError(c, 409, "APPLICATION_STATE_CONFLICT", result.message)
  return c.json({ idempotent: result.kind === "already_rejected", application: result.application })
})

adminApplicationRoutes.post("/:id/email-deliveries/:deliveryId/retry", requirePermission("applications:write"), async (c) => {
  const result = await retryApplicationEmailDelivery(c.req.param("id"), c.req.param("deliveryId"))
  if (result.kind === "not_found") return apiError(c, 404, "EMAIL_DELIVERY_NOT_FOUND", "Уведомление не найдено.")
  if (result.kind === "account_active") return c.json({ idempotent: true, accountAlreadyActivated: true })
  if (result.kind === "idempotency_window_elapsed") return apiError(c, 409, "EMAIL_IDEMPOTENCY_WINDOW_ELAPSED", "Срок безопасного повтора истёк. Проверьте статус письма в Resend перед повторной отправкой.")
  if (result.kind === "not_retryable") return apiError(c, 409, "EMAIL_DELIVERY_NOT_RETRYABLE", "Повторная отправка сейчас недоступна.")
  return c.json({ queued: true })
})

