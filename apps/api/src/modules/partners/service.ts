import { sql } from "drizzle-orm"
import { auditLogs, getDb, partnerAgreements, partners } from "@vizaje/db"

export async function updatePartnerStatus(partnerId: string, status: "active" | "suspended" | "banned", reason: string, actorUserId: string) {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${partnerId}))`)
    const rows = await tx.select().from(partners).where(eqId(partnerId)).limit(1)
    const partner = rows[0]
    if (!partner) return { kind: "not_found" as const }
    if (partner.status === status) return { kind: "unchanged" as const, partner }

    const now = new Date()
    const updatedRows = await tx.update(partners).set({ status, updatedAt: now }).where(eqId(partnerId)).returning()
    const updated = updatedRows[0]
    if (!updated) throw new Error("Partner status update failed")
    await tx.insert(auditLogs).values({
      actorUserId,
      action: "PARTNER_STATUS_CHANGED",
      entityType: "partner",
      entityId: partnerId,
      metadata: { from: partner.status, to: status, reason },
      createdAt: now,
    })
    return { kind: "updated" as const, partner: updated }
  })
}

function eqId(id: string) {
  return sql`${partners.id} = ${id}`
}

export async function createPartnerAgreement(
  partnerId: string,
  input: { commissionRate: number; startsAt: string; reason: string },
  actorUserId: string,
) {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${partnerId}))`)
    const partnerRows = await tx.select({ id: partners.id }).from(partners).where(eqId(partnerId)).limit(1)
    if (!partnerRows[0]) return { kind: "not_found" as const }

    const startsAt = new Date(`${input.startsAt}T00:00:00.000Z`)
    if (Number.isNaN(startsAt.getTime())) return { kind: "invalid_date" as const }

    const activeRows = await tx
      .select()
      .from(partnerAgreements)
      .where(sql`${partnerAgreements.partnerId} = ${partnerId} AND ${partnerAgreements.status} = 'active'`)
      .orderBy(sql`${partnerAgreements.startsAt} desc`)
    const current = activeRows[0]
    if (current && current.startsAt >= input.startsAt) return { kind: "conflict" as const, message: "Effective date must be after the active agreement." }

    const now = new Date()
    if (current) {
      const previousEnd = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      await tx
        .update(partnerAgreements)
        .set({ endsAt: previousEnd, status: "expired", updatedAt: now })
        .where(sql`${partnerAgreements.id} = ${current.id}`)
    }

    const rows = await tx
      .insert(partnerAgreements)
      .values({
        partnerId,
        createdByUserId: actorUserId,
        commissionRate: input.commissionRate.toFixed(2),
        startsAt: input.startsAt,
        status: "active",
        reason: input.reason,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    const agreement = rows[0]
    if (!agreement) throw new Error("Agreement creation failed")
    await tx.insert(auditLogs).values({
      actorUserId,
      action: "PARTNER_COMMISSION_AGREEMENT_CREATED",
      entityType: "partner",
      entityId: partnerId,
      metadata: { agreementId: agreement.id, commissionRate: input.commissionRate, startsAt: input.startsAt, reason: input.reason },
      createdAt: now,
    })
    return { kind: "created" as const, agreement }
  })
}

