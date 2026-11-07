import { and, count, desc, eq, isNull } from "drizzle-orm"
import { getDb, notifications } from "@vizaje/db"

export async function listNotifications(userId: string, page: number, pageSize: number) {
  const where = eq(notifications.recipientUserId, userId)
  const [rows, totalRows, unreadRows] = await Promise.all([
    getDb()
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    getDb().select({ value: count() }).from(notifications).where(where),
    getDb().select({ value: count() }).from(notifications).where(and(where, isNull(notifications.readAt))),
  ])

  return {
    notifications: rows,
    total: Number(totalRows[0]?.value ?? 0),
    unreadCount: Number(unreadRows[0]?.value ?? 0),
    page,
    pageSize,
  }
}

export async function getUnreadNotificationCount(userId: string) {
  const rows = await getDb()
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt)))
  return Number(rows[0]?.value ?? 0)
}

export async function getNotification(userId: string, notificationId: string) {
  const rows = await getDb()
    .select({ id: notifications.id, readAt: notifications.readAt })
    .from(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.recipientUserId, userId)))
    .limit(1)
  return rows[0] ?? null
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const rows = await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.recipientUserId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id })
  return rows.length > 0
}

export async function markAllNotificationsRead(userId: string) {
  const rows = await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id })
  return rows.length
}
