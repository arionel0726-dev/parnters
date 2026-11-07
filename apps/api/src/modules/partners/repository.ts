import { and, count, desc, eq, ilike, or } from "drizzle-orm"
import {
  applicationReviews,
  auditLogs,
  creatorApplications,
  partnerAgreements,
  partnerInvitations,
  partners,
  users,
  getDb,
} from "@vizaje/db"

export async function listPartners({
  status,
  type,
  page,
  pageSize,
  search,
}: {
  status?: "active" | "suspended" | "banned"
  type?: "creator" | "referral"
  page: number
  pageSize: number
  search?: string
}) {
  const filters = []
  if (status) filters.push(eq(partners.status, status))
  if (type) filters.push(eq(partners.type, type))
  if (search) {
    filters.push(
      or(
        ilike(partners.creatorId, `%${search}%`),
        ilike(partners.displayName, `%${search}%`),
        ilike(partners.email, `%${search}%`),
      )!,
    )
  }
  const where = filters.length ? and(...filters) : undefined
  const [rows, totals] = await Promise.all([
    getDb()
      .select()
      .from(partners)
      .where(where)
      .orderBy(desc(partners.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    getDb().select({ value: count() }).from(partners).where(where),
  ])

  const activeAgreements = await getDb()
    .select({ partnerId: partnerAgreements.partnerId, commissionRate: partnerAgreements.commissionRate })
    .from(partnerAgreements)
    .where(eq(partnerAgreements.status, "active"))
  const rates = new Map(activeAgreements.map((agreement) => [agreement.partnerId, agreement.commissionRate]))

  return {
    rows: rows.map((partner) => ({ ...partner, commissionRate: rates.get(partner.id) ?? null })),
    total: Number(totals[0]?.value ?? 0),
  }
}

export async function getPartnerRecord(id: string) {
  const partnerRows = await getDb().select().from(partners).where(eq(partners.id, id)).limit(1)
  const partner = partnerRows[0]
  if (!partner) return null

  const [agreements, applications, invitations, activity] = await Promise.all([
    getDb().select().from(partnerAgreements).where(eq(partnerAgreements.partnerId, id)).orderBy(desc(partnerAgreements.startsAt)),
    getDb().select().from(creatorApplications).where(eq(creatorApplications.partnerId, id)).orderBy(desc(creatorApplications.createdAt)),
    getDb().select({ id: partnerInvitations.id, status: partnerInvitations.status, expiresAt: partnerInvitations.expiresAt, createdAt: partnerInvitations.createdAt, acceptedAt: partnerInvitations.acceptedAt }).from(partnerInvitations).where(eq(partnerInvitations.partnerId, id)).orderBy(desc(partnerInvitations.createdAt)),
    getDb()
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        actor: { id: users.id, name: users.name, email: users.email },
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(and(eq(auditLogs.entityType, "partner"), eq(auditLogs.entityId, id)))
      .orderBy(desc(auditLogs.createdAt)),
  ])

  const applicationIds = applications.map((application) => application.id)
  const reviews = applicationIds.length
    ? await getDb()
        .select({
          id: applicationReviews.id,
          applicationId: applicationReviews.applicationId,
          action: applicationReviews.action,
          reason: applicationReviews.reason,
          createdAt: applicationReviews.createdAt,
          reviewer: { id: users.id, name: users.name, email: users.email },
        })
        .from(applicationReviews)
        .leftJoin(users, eq(applicationReviews.reviewerUserId, users.id))
        .where(or(...applicationIds.map((applicationId) => eq(applicationReviews.applicationId, applicationId))))
        .orderBy(desc(applicationReviews.createdAt))
    : []

  return { partner, agreements, applications, invitations, reviews, activity }
}

export async function listPartnerAgreements(status?: "draft" | "active" | "expired" | "cancelled") {
  return getDb()
    .select({
      agreement: partnerAgreements,
      partner: {
        id: partners.id,
        creatorId: partners.creatorId,
        displayName: partners.displayName,
        email: partners.email,
        status: partners.status,
      },
    })
    .from(partnerAgreements)
    .innerJoin(partners, eq(partnerAgreements.partnerId, partners.id))
    .where(status ? eq(partnerAgreements.status, status) : undefined)
    .orderBy(desc(partnerAgreements.startsAt), desc(partnerAgreements.createdAt))
    .limit(200)
}

