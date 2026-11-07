import { and, desc, eq, gte, lte, sql } from "drizzle-orm"
import { auditLogs, getDb, partnerAgreements, partners, payouts, referralLinkClicks, referralOrders, referralLinks } from "@vizaje/db"

type DateRange = { from?: Date; to?: Date }

function rangeWhere(column: typeof referralLinkClicks.clickedAt | typeof referralOrders.occurredAt, range: DateRange) {
  const conditions = []
  if (range.from) conditions.push(gte(column, range.from))
  if (range.to) conditions.push(lte(column, range.to))
  return conditions
}

function decimal(value: string | number | null | undefined) {
  return Number(value ?? 0)
}

export async function getCreatorFinance(partnerId: string, range: DateRange = {}) {
  const db = getDb()
  const clickConditions = [eq(referralLinkClicks.partnerId, partnerId), ...rangeWhere(referralLinkClicks.clickedAt, range)]
  const orderConditions = [eq(referralOrders.partnerId, partnerId), ...rangeWhere(referralOrders.occurredAt, range)]
  const [clickSummary, orderSummary, payoutSummary, orders, payoutRows, availableCommissionByCurrency, payoutsByCurrency, orderMoneyByCurrency] = await Promise.all([
    db.select({ clicks: sql<number>`count(*)::int` }).from(referralLinkClicks).where(and(...clickConditions)),
    db.select({
      orders: sql<number>`count(*) filter (where ${referralOrders.status} = 'confirmed')::int`,
      grossSales: sql<string>`coalesce(sum(case when ${referralOrders.status} = 'confirmed' then ${referralOrders.amount} else 0 end), 0)::text`,
      commission: sql<string>`coalesce(sum(case when ${referralOrders.status} = 'confirmed' then ${referralOrders.commissionAmount} else 0 end), 0)::text`,
    }).from(referralOrders).where(and(...orderConditions)),
    db.select({
      requested: sql<string>`coalesce(sum(case when ${payouts.status} in ('requested', 'approved') then ${payouts.amount} else 0 end), 0)::text`,
      paid: sql<string>`coalesce(sum(case when ${payouts.status} = 'paid' then ${payouts.amount} else 0 end), 0)::text`,
    }).from(payouts).where(eq(payouts.partnerId, partnerId)),
    db.select({
      id: referralOrders.id,
      orderId: referralOrders.orderId,
      amount: referralOrders.amount,
      currency: referralOrders.currency,
      commissionRate: referralOrders.commissionRate,
      commissionAmount: referralOrders.commissionAmount,
      status: referralOrders.status,
      occurredAt: referralOrders.occurredAt,
      referralCode: referralLinks.code,
      linkLabel: referralLinks.label,
    }).from(referralOrders).innerJoin(referralLinks, eq(referralOrders.referralLinkId, referralLinks.id)).where(and(...orderConditions)).orderBy(desc(referralOrders.occurredAt)).limit(100),
    db.select().from(payouts).where(eq(payouts.partnerId, partnerId)).orderBy(desc(payouts.requestedAt)).limit(100),
    db.select({
      currency: referralOrders.currency,
      value: sql<string>`coalesce(sum(case when ${referralOrders.status} = 'confirmed' then ${referralOrders.commissionAmount} else 0 end), 0)::text`,
    }).from(referralOrders).where(eq(referralOrders.partnerId, partnerId)).groupBy(referralOrders.currency),
    db.select({
      currency: payouts.currency,
      reserved: sql<string>`coalesce(sum(case when ${payouts.status} in ('requested', 'approved', 'paid') then ${payouts.amount} else 0 end), 0)::text`,
      requested: sql<string>`coalesce(sum(case when ${payouts.status} in ('requested', 'approved') then ${payouts.amount} else 0 end), 0)::text`,
      paid: sql<string>`coalesce(sum(case when ${payouts.status} = 'paid' then ${payouts.amount} else 0 end), 0)::text`,
    }).from(payouts).where(eq(payouts.partnerId, partnerId)).groupBy(payouts.currency),
    db.select({
      currency: referralOrders.currency,
      grossSales: sql<string>`coalesce(sum(case when ${referralOrders.status} = 'confirmed' then ${referralOrders.amount} else 0 end), 0)::text`,
      commission: sql<string>`coalesce(sum(case when ${referralOrders.status} = 'confirmed' then ${referralOrders.commissionAmount} else 0 end), 0)::text`,
    }).from(referralOrders).where(and(...orderConditions)).groupBy(referralOrders.currency),
  ])

  const summaryRow = orderSummary[0]
  const payoutRow = payoutSummary[0]
  const commission = decimal(summaryRow?.commission)
  const requested = decimal(payoutRow?.requested)
  const paid = decimal(payoutRow?.paid)
  const balances = new Map<string, { commission: number; payouts: number }>()
  for (const row of availableCommissionByCurrency) balances.set(row.currency, { commission: decimal(row.value), payouts: 0 })
  for (const row of payoutsByCurrency) {
    const balance = balances.get(row.currency) ?? { commission: 0, payouts: 0 }
    balance.payouts = decimal(row.reserved)
    balances.set(row.currency, balance)
  }
  const orderMoney = orderMoneyByCurrency
    .map((row) => ({ currency: row.currency, grossSales: row.grossSales, commission: row.commission }))
    .sort((left, right) => left.currency.localeCompare(right.currency))
  const payoutMoney = payoutsByCurrency
    .map((row) => ({ currency: row.currency, requested: row.requested, paid: row.paid }))
    .sort((left, right) => left.currency.localeCompare(right.currency))
  return {
    summary: {
      clicks: Number(clickSummary[0]?.clicks ?? 0),
      orders: Number(summaryRow?.orders ?? 0),
      grossSales: String(summaryRow?.grossSales ?? "0"),
      commission: String(summaryRow?.commission ?? "0"),
      requestedPayout: String(payoutRow?.requested ?? "0"),
      paidPayout: String(payoutRow?.paid ?? "0"),
      availablePayout: Math.max(0, commission - requested - paid).toFixed(2),
      availableByCurrency: [...balances.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, balance]) => ({ currency, amount: Math.max(0, balance.commission - balance.payouts).toFixed(2) })),
      grossSalesByCurrency: orderMoney.map(({ currency, grossSales }) => ({ currency, amount: grossSales })),
      commissionByCurrency: orderMoney.map(({ currency, commission }) => ({ currency, amount: commission })),
      requestedPayoutByCurrency: payoutMoney.map(({ currency, requested }) => ({ currency, amount: requested })),
      paidPayoutByCurrency: payoutMoney.map(({ currency, paid }) => ({ currency, amount: paid })),
    },
    orders,
    payouts: payoutRows,
  }
}

async function getAvailablePayout(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], partnerId: string, currency: string) {
  const [commissionRows, payoutRows] = await Promise.all([
    tx.select({ value: sql<string>`coalesce(sum(case when ${referralOrders.status} = 'confirmed' then ${referralOrders.commissionAmount} else 0 end), 0)::text` }).from(referralOrders).where(and(eq(referralOrders.partnerId, partnerId), eq(referralOrders.currency, currency))),
    tx.select({ value: sql<string>`coalesce(sum(case when ${payouts.status} in ('requested', 'approved', 'paid') then ${payouts.amount} else 0 end), 0)::text` }).from(payouts).where(and(eq(payouts.partnerId, partnerId), eq(payouts.currency, currency))),
  ])
  return Math.max(0, decimal(commissionRows[0]?.value) - decimal(payoutRows[0]?.value))
}

export async function requestPayout(partnerId: string, amount: number, currency: string, idempotencyKey: string) {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${partnerId}))`)
    const existingRows = await tx.select().from(payouts).where(and(eq(payouts.partnerId, partnerId), eq(payouts.idempotencyKey, idempotencyKey))).limit(1)
    if (existingRows[0]) {
      if (existingRows[0].currency !== currency || decimal(existingRows[0].amount) !== decimal(amount)) return { kind: "idempotency_conflict" as const }
      return { kind: "idempotent" as const, payout: existingRows[0] }
    }
    const partnerRows = await tx.select({ id: partners.id, status: partners.status, type: partners.type }).from(partners).where(eq(partners.id, partnerId)).limit(1)
    const partner = partnerRows[0]
    if (!partner || partner.type !== "creator" || partner.status !== "active") return { kind: "not_eligible" as const }
    const available = await getAvailablePayout(tx, partnerId, currency)
    if (amount > available + 0.0001) return { kind: "insufficient_balance" as const, available }
    const now = new Date()
    const rows = await tx.insert(payouts).values({ partnerId, amount: amount.toFixed(2), currency, idempotencyKey, status: "requested", requestedAt: now, createdAt: now, updatedAt: now }).returning()
    const payout = rows[0]
    if (!payout) throw new Error("Payout request failed")
    await tx.insert(auditLogs).values({ actorUserId: null, action: "PAYOUT_REQUESTED", entityType: "partner", entityId: partnerId, metadata: { payoutId: payout.id, amount: amount.toFixed(2), currency }, createdAt: now })
    return { kind: "created" as const, payout }
  })
}

export async function updatePayoutStatus(payoutId: string, status: "approved" | "paid" | "rejected" | "cancelled", reason: string | null, actorUserId: string) {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${payoutId}))`)
    const rows = await tx.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1)
    const payout = rows[0]
    if (!payout) return { kind: "not_found" as const }
    if (payout.status === status) return { kind: "unchanged" as const, payout }
    const allowed = payout.status === "requested"
      ? status === "approved" || status === "rejected" || status === "cancelled"
      : payout.status === "approved" && (status === "paid" || status === "rejected" || status === "cancelled")
    if (!allowed) return { kind: "invalid_transition" as const }
    if (status === "rejected" && !reason?.trim()) return { kind: "reason_required" as const }
    const now = new Date()
    const updatedRows = await tx.update(payouts).set({ status, processedAt: status === "paid" || status === "rejected" || status === "cancelled" ? now : null, processedByUserId: actorUserId, rejectionReason: status === "rejected" ? reason!.trim() : null, updatedAt: now }).where(eq(payouts.id, payoutId)).returning()
    const updated = updatedRows[0]
    if (!updated) throw new Error("Payout update failed")
    await tx.insert(auditLogs).values({ actorUserId, action: "PAYOUT_STATUS_CHANGED", entityType: "partner", entityId: payout.partnerId, metadata: { payoutId, from: payout.status, to: status, reason }, createdAt: now })
    return { kind: "updated" as const, payout: updated }
  })
}

export async function listAdminPayouts(status?: "requested" | "approved" | "paid" | "rejected" | "cancelled") {
  const conditions = status ? [eq(payouts.status, status)] : []
  return getDb().select({ payout: payouts, partner: { id: partners.id, displayName: partners.displayName, creatorId: partners.creatorId, email: partners.email } }).from(payouts).innerJoin(partners, eq(payouts.partnerId, partners.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(payouts.requestedAt)).limit(200)
}

export async function getPartnerFinanceSummary(partnerId: string) {
  const finance = await getCreatorFinance(partnerId)
  return finance.summary
}
