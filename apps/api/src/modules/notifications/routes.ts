import { Hono } from "hono"
import { z } from "zod"
import type { ApiEnv } from "../../auth/middleware"
import { requireAuth } from "../../auth/middleware"
import { apiError } from "../../http/errors"
import {
  getNotification,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./repository"

const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

const notificationIdSchema = z.string().uuid()

export const notificationRoutes = new Hono<ApiEnv>()

notificationRoutes.use("*", requireAuth)

notificationRoutes.get("/", async (c) => {
  const parsed = notificationListQuerySchema.safeParse({
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  })
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Некорректные параметры уведомлений.", parsed.error.flatten().fieldErrors)

  const result = await listNotifications(c.get("auth").user.id, parsed.data.page, parsed.data.pageSize)
  return c.json(result)
})

notificationRoutes.get("/unread-count", async (c) => {
  const unreadCount = await getUnreadNotificationCount(c.get("auth").user.id)
  return c.json({ unreadCount })
})

notificationRoutes.post("/read-all", async (c) => {
  const markedCount = await markAllNotificationsRead(c.get("auth").user.id)
  return c.json({ markedCount })
})

notificationRoutes.post("/:id/read", async (c) => {
  const notificationId = c.req.param("id")
  if (!notificationIdSchema.safeParse(notificationId).success) {
    return apiError(c, 400, "VALIDATION_ERROR", "Некорректный идентификатор уведомления.")
  }

  const userId = c.get("auth").user.id
  const existing = await getNotification(userId, notificationId)
  if (!existing) return apiError(c, 404, "NOTIFICATION_NOT_FOUND", "Уведомление не найдено.")
  if (existing.readAt) return c.json({ marked: true, idempotent: true })
  await markNotificationRead(userId, notificationId)
  return c.json({ marked: true, idempotent: false })
})
