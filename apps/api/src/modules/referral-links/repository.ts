import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm"
import { getDb, partners, referralAttributions, referralLinkClicks, referralLinks, referralOrders } from "@vizaje/db"
import { getApiEnv } from "../../env"

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
  const db = getDb()
  const env = getApiEnv()
  const linkOwners = await db
    .select({ id: referralLinks.id, partnerId: referralLinks.partnerId })
    .from(referralLinks)
    .where(inArray(referralLinks.id, linkIds))
  const analyticsPartnerIds = new Set(env.REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS)
  const analyticsLinkIds = linkOwners
    .filter(({ partnerId }) => env.REFERRAL_ANALYTICS_ENABLED && analyticsPartnerIds.has(partnerId))
    .map(({ id }) => id)
  const legacyTrackingLinkIds = linkOwners
    .filter(({ id }) => !analyticsLinkIds.includes(id))
    .map(({ id }) => id)

  const [clickRows, orderRows] = await Promise.all([
    (async () => {
      const trackingRows = legacyTrackingLinkIds.length
        ? await db
          .select({ linkId: referralLinkClicks.referralLinkId, count: sql<number>`count(*)::int` })
          .from(referralLinkClicks)
          .innerJoin(referralLinks, and(
            eq(referralLinks.id, referralLinkClicks.referralLinkId),
            eq(referralLinks.partnerId, referralLinkClicks.partnerId),
          ))
          .where(inArray(referralLinkClicks.referralLinkId, legacyTrackingLinkIds))
          .groupBy(referralLinkClicks.referralLinkId)
        : []
      const attributionRows = analyticsLinkIds.length
        ? await db
          .select({ linkId: referralAttributions.referralLinkId, count: sql<number>`count(*)::int` })
          .from(referralAttributions)
          .innerJoin(referralLinks, and(
            eq(referralLinks.id, referralAttributions.referralLinkId),
            eq(referralLinks.partnerId, referralAttributions.partnerId),
          ))
          .where(inArray(referralAttributions.referralLinkId, analyticsLinkIds))
          .groupBy(referralAttributions.referralLinkId)
        : []
      return [...trackingRows, ...attributionRows]
    })(),
    db
      .select({ linkId: referralOrders.referralLinkId, count: sql<number>`count(*) filter (where ${referralOrders.status} = 'confirmed')::int` })
      .from(referralOrders)
      .innerJoin(referralLinks, and(
        eq(referralLinks.id, referralOrders.referralLinkId),
        eq(referralLinks.partnerId, referralOrders.partnerId),
      ))
      .where(inArray(referralOrders.referralLinkId, linkIds))
      .groupBy(referralOrders.referralLinkId),
  ])
  const stats = new Map<string, { clicks: number; orders: number }>()
  for (const id of linkIds) stats.set(id, { clicks: 0, orders: 0 })
  for (const row of clickRows) stats.get(row.linkId)!.clicks = Number(row.count)
  for (const row of orderRows) stats.get(row.linkId)!.orders = Number(row.count)
  return stats
}
