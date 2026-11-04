import { and, desc, eq, isNotNull, sql } from "drizzle-orm"
import { auditLogs, creatorApplications, getDb, partnerAccounts, partnerAgreements, partners, referralLinks, users } from "@vizaje/db"

export async function getCreatorDashboard(userId: string, partnerId: string) {
  const db = getDb()
  const [partnerRows, agreementRows, applicationRows, linkCountRows] = await Promise.all([
    db
      .select({
        creatorId: partners.creatorId,
        displayName: partners.displayName,
        phone: partners.phone,
        instagram: partners.instagram,
        tiktok: partners.tiktok,
        otherSocial: partners.otherSocial,
        partnerType: partners.type,
        status: partners.status,
        email: users.email,
      })
      .from(partners)
      .innerJoin(partnerAccounts, eq(partnerAccounts.partnerId, partners.id))
      .innerJoin(users, eq(users.id, partnerAccounts.userId))
      .where(and(
        eq(partners.id, partnerId),
        eq(partnerAccounts.userId, userId),
        eq(partners.type, "creator"),
        eq(partners.status, "active"),
        isNotNull(partners.creatorId),
      ))
      .limit(1),
    db
      .select({ id: partnerAgreements.id, commissionRate: partnerAgreements.commissionRate, startsAt: partnerAgreements.startsAt, endsAt: partnerAgreements.endsAt })
      .from(partnerAgreements)
      .where(sql`${partnerAgreements.partnerId} = ${partnerId} AND ${partnerAgreements.status} = 'active' AND ${partnerAgreements.startsAt} <= CURRENT_DATE AND (${partnerAgreements.endsAt} IS NULL OR ${partnerAgreements.endsAt} >= CURRENT_DATE)`)
      .orderBy(desc(partnerAgreements.startsAt))
      .limit(1),
    db
      .select({ partnershipFormat: creatorApplications.partnershipFormat })
      .from(creatorApplications)
      .where(and(eq(creatorApplications.partnerId, partnerId), eq(creatorApplications.status, "approved")))
      .orderBy(desc(creatorApplications.createdAt))
      .limit(1),
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${referralLinks.status} = 'active' and (${referralLinks.expiresAt} is null or ${referralLinks.expiresAt} > now()))::int`,
        revoked: sql<number>`count(*) filter (where ${referralLinks.status} = 'revoked')::int`,
        expired: sql<number>`count(*) filter (where ${referralLinks.status} = 'active' and ${referralLinks.expiresAt} <= now())::int`,
      })
      .from(referralLinks)
      .where(eq(referralLinks.partnerId, partnerId)),
  ])

  const partner = partnerRows[0]
  if (!partner?.creatorId) return null
  const agreement = agreementRows[0]
  const counts = linkCountRows[0]

  return {
    profile: {
      ...partner,
      phone: partner.phone ?? "",
      instagram: partner.instagram,
      tiktok: partner.tiktok,
      otherSocial: partner.otherSocial,
      partnershipFormat: applicationRows[0]?.partnershipFormat ?? null,
      agreement: agreement ? { ...agreement, commissionRate: String(agreement.commissionRate) } : null,
    },
    links: {
      total: Number(counts?.total ?? 0),
      active: Number(counts?.active ?? 0),
      revoked: Number(counts?.revoked ?? 0),
      expired: Number(counts?.expired ?? 0),
    },
  }
}

export async function updateCreatorProfile(
  userId: string,
  partnerId: string,
  input: {
    displayName: string
    phone: string
    instagram?: string | null
    tiktok?: string | null
    otherSocial?: string | null
  },
  suppliedSocialFields: string[],
) {
  return getDb().transaction(async (tx) => {
    const patch: {
      displayName: string
      phone: string
      updatedAt: Date
      instagram?: string | null
      tiktok?: string | null
      otherSocial?: string | null
    } = { displayName: input.displayName, phone: input.phone, updatedAt: new Date() }

    for (const field of suppliedSocialFields) {
      if (field === "instagram") patch.instagram = input.instagram ?? null
      if (field === "tiktok") patch.tiktok = input.tiktok ?? null
      if (field === "otherSocial") patch.otherSocial = input.otherSocial ?? null
    }

    const rows = await tx
      .update(partners)
      .set(patch)
      .where(and(eq(partners.id, partnerId), eq(partners.type, "creator"), eq(partners.status, "active"), isNotNull(partners.creatorId)))
      .returning({ id: partners.id })
    if (!rows[0]) return { kind: "not_eligible" as const }

    await tx.update(users).set({ name: input.displayName, updatedAt: new Date() }).where(eq(users.id, userId))
    await tx.insert(auditLogs).values({
      actorUserId: userId,
      action: "CREATOR_PROFILE_UPDATED",
      entityType: "partner",
      entityId: partnerId,
      metadata: { fields: ["displayName", "phone", ...suppliedSocialFields] },
      createdAt: new Date(),
    })
    return { kind: "updated" as const }
  })
}
