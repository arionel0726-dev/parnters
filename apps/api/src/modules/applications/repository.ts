import { and, count, desc, eq, ilike, or } from "drizzle-orm"
import { applicationReviews, creatorApplications, emailDeliveries, users, type NewCreatorApplication } from "@vizaje/db"
import { getDb } from "@vizaje/db"

export async function findDuplicateApplication(email: string, phone: string) {
  const rows = await getDb()
    .select({ id: creatorApplications.id, status: creatorApplications.status })
    .from(creatorApplications)
    .where(
      and(
        or(eq(creatorApplications.email, email), eq(creatorApplications.phone, phone)),
        or(eq(creatorApplications.status, "pending"), eq(creatorApplications.status, "approved")),
      ),
    )
    .limit(1)

  return rows[0]
}

export async function insertApplication(values: NewCreatorApplication) {
  const rows = await getDb().insert(creatorApplications).values(values).returning()
  return rows[0]
}

export async function listApplications({
  status,
  page,
  pageSize,
  search,
}: {
  status: "pending" | "approved" | "rejected"
  page: number
  pageSize: number
  search?: string
}) {
  const filters = [eq(creatorApplications.status, status)]
  if (search) {
    filters.push(
      or(
        ilike(creatorApplications.fullName, `%${search}%`),
        ilike(creatorApplications.email, `%${search}%`),
      )!,
    )
  }
  const where = and(...filters)
  const [rows, totals] = await Promise.all([
    getDb()
      .select()
      .from(creatorApplications)
      .where(where)
      .orderBy(desc(creatorApplications.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    getDb().select({ value: count() }).from(creatorApplications).where(where),
  ])

  return { rows, total: Number(totals[0]?.value ?? 0) }
}

export async function getApplicationRecord(id: string) {
  const rows = await getDb().select().from(creatorApplications).where(eq(creatorApplications.id, id)).limit(1)
  if (!rows[0]) return null

  const reviews = await getDb()
    .select({
      id: applicationReviews.id,
      action: applicationReviews.action,
      reason: applicationReviews.reason,
      createdAt: applicationReviews.createdAt,
      reviewer: { id: users.id, name: users.name, email: users.email },
    })
    .from(applicationReviews)
    .leftJoin(users, eq(applicationReviews.reviewerUserId, users.id))
    .where(eq(applicationReviews.applicationId, id))
    .orderBy(desc(applicationReviews.createdAt))

  const deliveries = await getDb()
    .select({
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
    })
    .from(emailDeliveries)
    .where(eq(emailDeliveries.applicationId, id))
    .orderBy(desc(emailDeliveries.createdAt))

  return { application: rows[0], reviews, emailDeliveries: deliveries }
}

