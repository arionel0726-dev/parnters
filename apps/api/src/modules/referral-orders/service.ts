import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm"
import { auditLogs, getDb, partnerAgreements, partners, referralLinks, referralOrders } from "@vizaje/db"
import type { ReferralOrderEventV1 } from "@vizaje/contracts"

function money(value: string) {
  return Number(value).toFixed(2)
}

export async function ingestReferralOrderEvent(event: ReferralOrderEventV1) {
  const occurredAt = new Date(event.occurredAt)
  if (Number.isNaN(occurredAt.getTime())) return { kind: "invalid_event" as const }

  return getDb().transaction(async (tx) => {
    // Serialize deliveries for the same event/order so concurrent retries cannot
    // create duplicate ledger rows before the unique indexes are checked.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`referral-event:${event.eventId}`}))`)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`referral-order:${event.orderId}`}))`)
    const duplicate = await tx.select({ id: referralOrders.id }).from(referralOrders).where(eq(referralOrders.eventId, event.eventId)).limit(1)
    if (duplicate[0]) return { kind: "idempotent" as const, id: duplicate[0].id }

    const linkRows = await tx.select({ link: referralLinks, partner: partners }).from(referralLinks).innerJoin(partners, eq(referralLinks.partnerId, partners.id)).where(eq(referralLinks.code, event.referralCode)).limit(1)
    const link = linkRows[0]
    if (!link?.partner.creatorId || link.partner.creatorId !== event.creatorId || link.partner.type !== "creator") return { kind: "link_not_found" as const }

    const currentRows = await tx.select().from(referralOrders).where(eq(referralOrders.orderId, event.orderId)).limit(1)
    const current = currentRows[0]
    if (event.eventType !== "order.created" && !current) return { kind: "order_not_found" as const }
    if (current && (
      current.referralLinkId !== link.link.id
      || current.partnerId !== link.partner.id
      || current.creatorId !== event.creatorId
      || current.currency !== event.currency
    )) return { kind: "order_binding_conflict" as const }

    const rateRows = await tx.select({ commissionRate: partnerAgreements.commissionRate }).from(partnerAgreements).where(and(
      eq(partnerAgreements.partnerId, link.partner.id),
      eq(partnerAgreements.status, "active"),
      lte(partnerAgreements.startsAt, occurredAt.toISOString().slice(0, 10)),
      or(isNull(partnerAgreements.endsAt), gte(partnerAgreements.endsAt, occurredAt.toISOString().slice(0, 10))),
    )).orderBy(sql`${partnerAgreements.startsAt} desc`).limit(1)
    const commissionRate = Number(rateRows[0]?.commissionRate ?? 0)
    const commissionAmount = event.eventType === "order.cancelled" ? current?.commissionAmount ?? "0" : money(String(Number(event.amount) * commissionRate / 100))
    const now = new Date()

    if (current) {
      const rows = await tx.update(referralOrders).set({
        eventId: event.eventId,
        referralLinkId: link.link.id,
        partnerId: link.partner.id,
        creatorId: event.creatorId,
        amount: event.amount,
        currency: event.currency,
        commissionRate: commissionRate.toFixed(2),
        commissionAmount,
        status: event.eventType === "order.cancelled" ? "cancelled" : "confirmed",
        occurredAt,
        updatedAt: now,
      }).where(eq(referralOrders.id, current.id)).returning()
      const order = rows[0]
      if (!order) throw new Error("Referral order update failed")
      await tx.insert(auditLogs).values({ actorUserId: null, action: "REFERRAL_ORDER_EVENT_INGESTED", entityType: "partner", entityId: link.partner.id, metadata: { orderId: event.orderId, eventId: event.eventId, eventType: event.eventType }, createdAt: now })
      return { kind: "updated" as const, order }
    }

    const rows = await tx.insert(referralOrders).values({
      eventId: event.eventId,
      orderId: event.orderId,
      referralLinkId: link.link.id,
      partnerId: link.partner.id,
      creatorId: event.creatorId,
      amount: event.amount,
      currency: event.currency,
      commissionRate: commissionRate.toFixed(2),
      commissionAmount,
      status: "confirmed",
      occurredAt,
      createdAt: now,
      updatedAt: now,
    }).returning()
    const order = rows[0]
    if (!order) throw new Error("Referral order creation failed")
    await tx.insert(auditLogs).values({ actorUserId: null, action: "REFERRAL_ORDER_EVENT_INGESTED", entityType: "partner", entityId: link.partner.id, metadata: { orderId: event.orderId, eventId: event.eventId, eventType: event.eventType }, createdAt: now })
    return { kind: "created" as const, order }
  })
}
