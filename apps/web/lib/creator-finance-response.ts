import { z } from "zod"

const countSchema = z.number().int().nonnegative()
const decimalSchema = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/)
const moneyBreakdownSchema = z.array(z.object({
  currency: z.string().min(1),
  amount: decimalSchema,
}))

const financeSummarySchema = z.object({
  clicks: countSchema,
  orders: countSchema,
  grossSales: decimalSchema,
  commission: decimalSchema,
  requestedPayout: decimalSchema,
  paidPayout: decimalSchema,
  availablePayout: decimalSchema,
  availableByCurrency: moneyBreakdownSchema,
  grossSalesByCurrency: moneyBreakdownSchema,
  commissionByCurrency: moneyBreakdownSchema,
  requestedPayoutByCurrency: moneyBreakdownSchema,
  paidPayoutByCurrency: moneyBreakdownSchema,
})

const financeOrderSchema = z.object({
  id: z.string().min(1),
  orderId: z.string(),
  amount: decimalSchema,
  currency: z.string().min(1),
  commissionRate: z.string(),
  commissionAmount: decimalSchema,
  status: z.enum(["confirmed", "cancelled"]),
  occurredAt: z.iso.datetime(),
  referralCode: z.string(),
  linkLabel: z.string(),
})

const payoutSchema = z.object({
  id: z.string().min(1),
  amount: decimalSchema,
  currency: z.string().min(1),
  status: z.enum(["requested", "approved", "paid", "rejected", "cancelled"]),
  requestedAt: z.iso.datetime(),
  processedAt: z.iso.datetime().nullable(),
  rejectionReason: z.string().nullable(),
})

const financeAnalyticsResponseSchema = z.object({
  summary: financeSummarySchema,
  orders: z.array(financeOrderSchema),
  payouts: z.array(payoutSchema),
})

const financeOrdersResponseSchema = z.object({
  summary: financeSummarySchema,
  orders: z.array(financeOrderSchema),
})

const financePayoutsResponseSchema = z.object({
  summary: financeSummarySchema,
  payouts: z.array(payoutSchema),
})

export type CreatorFinanceSummary = z.infer<typeof financeSummarySchema>
export type CreatorFinanceOrder = z.infer<typeof financeOrderSchema>
export type CreatorPayout = z.infer<typeof payoutSchema>
export type CreatorFinanceAnalyticsResponse = z.infer<typeof financeAnalyticsResponseSchema>
export type CreatorFinanceOrdersResponse = z.infer<typeof financeOrdersResponseSchema>
export type CreatorFinancePayoutsResponse = z.infer<typeof financePayoutsResponseSchema>

export function parseCreatorFinanceAnalyticsResponse(value: unknown): CreatorFinanceAnalyticsResponse {
  return financeAnalyticsResponseSchema.parse(value)
}

export function parseCreatorFinanceOrdersResponse(value: unknown): CreatorFinanceOrdersResponse {
  return financeOrdersResponseSchema.parse(value)
}

export function parseCreatorFinancePayoutsResponse(value: unknown): CreatorFinancePayoutsResponse {
  return financePayoutsResponseSchema.parse(value)
}

export function getApiErrorCode(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("error" in value)) return undefined
  const error = value.error
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined
  return typeof error.code === "string" ? error.code : undefined
}
