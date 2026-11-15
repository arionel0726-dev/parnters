import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseCreatorFinanceAnalyticsResponse } from "../lib/creator-finance-response"

const emptyFinanceResponse = {
  summary: {
    clicks: 0,
    orders: 0,
    grossSales: "0",
    commission: "0",
    requestedPayout: "0",
    paidPayout: "0",
    availablePayout: "0.00",
    availableByCurrency: [],
    grossSalesByCurrency: [],
    commissionByCurrency: [],
    requestedPayoutByCurrency: [],
    paidPayoutByCurrency: [],
  },
  orders: [],
  payouts: [],
}

describe("creator finance API response validation", () => {
  it("accepts a valid empty finance response", () => {
    assert.deepEqual(parseCreatorFinanceAnalyticsResponse(emptyFinanceResponse), emptyFinanceResponse)
  })

  it("rejects missing balances instead of substituting an empty list", () => {
    const summary = { ...emptyFinanceResponse.summary }
    Reflect.deleteProperty(summary, "availableByCurrency")
    assert.throws(() => parseCreatorFinanceAnalyticsResponse({
      ...emptyFinanceResponse,
      summary,
    }))
  })

  it("rejects partial responses and referral analytics data on the finance endpoint", () => {
    assert.throws(() => parseCreatorFinanceAnalyticsResponse({ summary: { clicks: 0 }, orders: [] }))
    assert.throws(() => parseCreatorFinanceAnalyticsResponse({
      summary: { clicks: 0, addToCart: 0, createdOrders: 0, confirmedOrders: 0, cancelledOrders: 0, revenueMdl: "0.00", conversionRate: 0 },
      links: [],
    }))
  })
})
