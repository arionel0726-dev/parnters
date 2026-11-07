import { and, eq, inArray } from "drizzle-orm"
import { getDb, notifications, partnerAccounts, users, type NotificationMetadata } from "@vizaje/db"

type NotificationTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0]

type NotificationInput = {
  eventKey: string
  type: "creator_application_submitted" | "creator_application_approved" | "creator_application_rejected" | "partner_commission_changed" | "partner_status_changed"
  title: string
  message: string
  metadata?: NotificationMetadata
}

const REVIEWER_ROLES = ["super_admin", "program_manager", "support"] as const

function validateMetadata(metadata: NotificationMetadata | undefined) {
  if (!metadata) return {}
  if (metadata.href && (!metadata.href.startsWith("/") || metadata.href.startsWith("//") || metadata.href.includes("\\"))) {
    throw new Error("Notification navigation must stay inside the application")
  }
  return {
    ...(metadata.href ? { href: metadata.href } : {}),
    ...(metadata.entityId ? { entityId: metadata.entityId } : {}),
    ...(metadata.locale ? { locale: metadata.locale } : {}),
    ...(metadata.status ? { status: metadata.status } : {}),
  }
}

export async function createNotifications(
  tx: NotificationTransaction,
  recipientUserIds: string[],
  input: NotificationInput,
) {
  const uniqueRecipientUserIds = [...new Set(recipientUserIds)]
  if (!uniqueRecipientUserIds.length) return 0

  const now = new Date()
  const rows = uniqueRecipientUserIds.map((recipientUserId) => ({
    recipientUserId,
    eventKey: input.eventKey,
    type: input.type,
    title: input.title,
    message: input.message,
    metadata: validateMetadata(input.metadata),
    createdAt: now,
  }))

  const inserted = await tx
    .insert(notifications)
    .values(rows)
    .onConflictDoNothing({ target: [notifications.recipientUserId, notifications.eventKey] })
    .returning({ id: notifications.id })

  return inserted.length
}

export async function notifyCreatorApplicationSubmitted(tx: NotificationTransaction, applicationId: string) {
  const reviewerRows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), inArray(users.role, [...REVIEWER_ROLES])))

  return createNotifications(tx, reviewerRows.map(({ id }) => id), {
    eventKey: `creator-application:${applicationId}:submitted`,
    type: "creator_application_submitted",
    title: "Новая заявка креатора",
    message: "Поступила новая заявка на рассмотрение.",
    metadata: { href: "/app/applications", entityId: applicationId },
  })
}

async function activePartnerUserIds(tx: NotificationTransaction, partnerId: string) {
  const rows = await tx
    .select({ userId: partnerAccounts.userId })
    .from(partnerAccounts)
    .innerJoin(users, eq(partnerAccounts.userId, users.id))
    .where(and(eq(partnerAccounts.partnerId, partnerId), eq(users.isActive, true)))
  return rows.map(({ userId }) => userId)
}

export async function notifyCreatorApplicationDecision(
  tx: NotificationTransaction,
  applicationId: string,
  partnerId: string | null,
  status: "approved" | "rejected",
  locale: "ru" | "ro",
) {
  if (!partnerId) return 0
  const recipientUserIds = await activePartnerUserIds(tx, partnerId)
  const approved = status === "approved"
  return createNotifications(tx, recipientUserIds, {
    eventKey: `creator-application:${applicationId}:${status}`,
    type: approved ? "creator_application_approved" : "creator_application_rejected",
    title: approved ? (locale === "ro" ? "Cererea a fost aprobată" : "Заявка одобрена") : (locale === "ro" ? "Cererea a fost respinsă" : "Заявка отклонена"),
    message: approved
      ? (locale === "ro" ? "Cererea ta de creator a fost aprobată." : "Ваша заявка креатора одобрена.")
      : (locale === "ro" ? "Cererea ta de creator a fost respinsă." : "Ваша заявка креатора отклонена."),
    metadata: { href: "/dashboard", entityId: applicationId, locale },
  })
}

export async function notifyPartnerCommissionChanged(tx: NotificationTransaction, partnerId: string, agreementId: string) {
  const recipientUserIds = await activePartnerUserIds(tx, partnerId)
  return createNotifications(tx, recipientUserIds, {
    eventKey: `partner-agreement:${agreementId}:commission-changed`,
    type: "partner_commission_changed",
    title: "Изменена комиссия",
    message: "Для вашего партнёрского аккаунта изменены условия комиссии.",
    metadata: { href: "/dashboard/earnings", entityId: partnerId },
  })
}

export async function notifyPartnerStatusChanged(
  tx: NotificationTransaction,
  partnerId: string,
  status: "active" | "suspended" | "banned",
) {
  const recipientUserIds = await activePartnerUserIds(tx, partnerId)
  const statusLabel = status === "active" ? "активен" : status === "suspended" ? "приостановлен" : "заблокирован"
  return createNotifications(tx, recipientUserIds, {
    eventKey: `partner:${partnerId}:status:${status}`,
    type: "partner_status_changed",
    title: "Изменён статус партнёра",
    message: `Статус вашего аккаунта: ${statusLabel}.`,
    metadata: { href: "/dashboard/settings", entityId: partnerId, status },
  })
}
