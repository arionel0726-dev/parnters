import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm"
import { getDb, partners, referralLinkClicks, referralLinks, referralOrders } from "@vizaje/db"

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

export async function getReferralLinkByCode(code: string) {
  const rows = await getDb()
    .select({ link: referralLinks, creatorId: partners.creatorId, partnerId: partners.id, partnerStatus: partners.status, partnerType: partners.type })
    .from(referralLinks)
    .innerJoin(partners, eq(referralLinks.partnerId, partners.id))
    .where(eq(referralLinks.code, code))
    .limit(1)
  return rows[0] ?? null
}

export async function getReferralLinkStats(linkIds: string[]) {
  if (!linkIds.length) return new Map<string, { clicks: number; orders: number }>()
  const [clickRows, orderRows] = await Promise.all([
    getDb()
      .select({ linkId: referralLinkClicks.referralLinkId, count: sql<number>`count(*)::int` })
      .from(referralLinkClicks)
      .where(or(...linkIds.map((id) => eq(referralLinkClicks.referralLinkId, id))))
      .groupBy(referralLinkClicks.referralLinkId),
    getDb()
      .select({ linkId: referralOrders.referralLinkId, count: sql<number>`count(*) filter (where ${referralOrders.status} = 'confirmed')::int` })
      .from(referralOrders)
      .where(or(...linkIds.map((id) => eq(referralOrders.referralLinkId, id))))
      .groupBy(referralOrders.referralLinkId),
  ])
  const stats = new Map<string, { clicks: number; orders: number }>()
  for (const id of linkIds) stats.set(id, { clicks: 0, orders: 0 })
  for (const row of clickRows) stats.get(row.linkId)!.clicks = Number(row.count)
  for (const row of orderRows) stats.get(row.linkId)!.orders = Number(row.count)
  return stats
}
