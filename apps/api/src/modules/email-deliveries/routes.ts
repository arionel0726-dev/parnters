import { desc, eq } from "drizzle-orm"
import { emailDeliveries, creatorApplications, getDb } from "@vizaje/db"
import { Hono } from "hono"
import type { ApiEnv } from "../../auth/middleware"
import { requirePermission } from "../../auth/middleware"
import { apiError } from "../../http/errors"
import { retryApplicationEmailDelivery } from "../applications/service"

export const adminEmailDeliveryRoutes = new Hono<ApiEnv>()

adminEmailDeliveryRoutes.get("/", requirePermission("applications:read"), async (c) => {
  const status = c.req.query("status")
  const rows = await getDb()
    .select({
      delivery: {
        id: emailDeliveries.id,
        eventType: emailDeliveries.eventType,
        status: emailDeliveries.status,
        attemptCount: emailDeliveries.attemptCount,
        nextAttemptAt: emailDeliveries.nextAttemptAt,
        lastAttemptAt: emailDeliveries.lastAttemptAt,
        sentAt: emailDeliveries.sentAt,
        providerMessageId: emailDeliveries.providerMessageId,
        lastError: emailDeliveries.lastError,
        createdAt: emailDeliveries.createdAt,
      },
      application: { id: creatorApplications.id, fullName: creatorApplications.fullName, email: creatorApplications.email, status: creatorApplications.status },
    })
    .from(emailDeliveries)
    .innerJoin(creatorApplications, eq(emailDeliveries.applicationId, creatorApplications.id))
    .where(status === "queued" || status === "sending" || status === "sent" || status === "failed" ? eq(emailDeliveries.status, status) : undefined)
    .orderBy(desc(emailDeliveries.createdAt))
    .limit(200)
  return c.json({ deliveries: rows })
})

adminEmailDeliveryRoutes.post("/:id/retry", requirePermission("applications:write"), async (c) => {
  const rows = await getDb().select({ applicationId: emailDeliveries.applicationId }).from(emailDeliveries).where(eq(emailDeliveries.id, c.req.param("id"))).limit(1)
  const delivery = rows[0]
  if (!delivery) return apiError(c, 404, "EMAIL_DELIVERY_NOT_FOUND", "Уведомление не найдено.")
  const result = await retryApplicationEmailDelivery(delivery.applicationId, c.req.param("id"))
  if (result.kind === "not_found") return apiError(c, 404, "EMAIL_DELIVERY_NOT_FOUND", "Уведомление не найдено.")
  if (result.kind === "account_active") return c.json({ idempotent: true, accountAlreadyActivated: true })
  if (result.kind === "idempotency_window_elapsed") return apiError(c, 409, "EMAIL_IDEMPOTENCY_WINDOW_ELAPSED", "Срок безопасного повтора истёк. Сначала проверьте статус письма у провайдера.")
  if (result.kind === "not_retryable") return apiError(c, 409, "EMAIL_DELIVERY_NOT_RETRYABLE", "Повторная отправка сейчас недоступна.")
  return c.json({ queued: true })
})
