import { and, desc, eq, gt, isNull, or } from "drizzle-orm"
import { getDb, partners, referralLinks } from "@vizaje/db"

export async function listReferralLinks(partnerId: string, status?: "active" | "revoked") {
  const filters = [eq(referralLinks.partnerId, partnerId)]
  if (status) filters.push(eq(referralLinks.status, status))
  return getDb().select().from(referralLinks).where(and(...filters)).orderBy(desc(referralLinks.createdAt))
}

export async function getReferralLinkForPartner(partnerId: string, linkId: string) {
  const rows = await getDb()
    .select()
    .from(referralLinks)
    .where(and(eq(referralLinks.id, linkId), eq(referralLinks.partnerId, partnerId)))
    .limit(1)
  return rows[0] ?? null
}

export async function getReferralLinksForPartner(partnerId: string) {
  const rows = await getDb()
    .select({
      link: referralLinks,
      creatorId: partners.creatorId,
      partnerStatus: partners.status,
      partnerType: partners.type,
    })
    .from(referralLinks)
    .innerJoin(partners, eq(referralLinks.partnerId, partners.id))
    .where(eq(referralLinks.partnerId, partnerId))
    .orderBy(desc(referralLinks.createdAt))
  return rows
}

export async function getActiveReferralLinkByCode(code: string) {
  const rows = await getDb()
    .select({ link: referralLinks, creatorId: partners.creatorId })
    .from(referralLinks)
    .innerJoin(partners, eq(referralLinks.partnerId, partners.id))
    .where(
      and(
        eq(referralLinks.code, code),
        eq(referralLinks.status, "active"),
        eq(partners.type, "creator"),
        eq(partners.status, "active"),
        or(isNull(referralLinks.expiresAt), gt(referralLinks.expiresAt, new Date())),
      ),
    )
    .limit(1)
  const result = rows[0]
  if (!result?.creatorId) return null
  return result
}
