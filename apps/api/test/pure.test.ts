import { describe, expect, test } from "bun:test"
import { referralCodeInputSchema, referralOrderEventV1Schema } from "@vizaje/contracts"
import { Hono } from "hono"
import { hasPermission } from "../src/auth/permissions"
import { requireFeature } from "../src/http/feature-flags"
import type { ApiEnv } from "../src/auth/middleware"
import { hasAmbiguousDeliveryOutcome, EMAIL_RECONCILIATION_REQUIRED } from "../src/modules/applications/email-delivery"
import { AUDIT_LOG_RETENTION_DAYS, getAuditLogRetentionCutoff } from "../src/modules/audit/retention"
import { InvalidReferralDestinationError, parseReferralDestination } from "../src/modules/referral-links/destinations"
import { generateReferralCode } from "../src/modules/referral-links/service"

describe("pure referral and delivery invariants", () => {
  test("generates opaque referral codes accepted by the public contract", () => {
    const code = generateReferralCode()
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)
    expect(referralCodeInputSchema.safeParse({ code }).success).toBe(true)
  })

  test.each([
    ["brand", "ru", "https://vizaje-nica.com/ru/catalog/anastasia-beverly-hills"],
    ["brand", "ro", "https://vizaje-nica.com/ro/catalog/anastasia-beverly-hills"],
    ["category", "ru", "https://vizaje-nica.com/ru/catalog/ten-piele"],
    ["category", "ro", "https://vizaje-nica.com/ro/catalog/ten-piele"],
    ["product", "ru", "https://vizaje-nica.com/ru/catalog/ten-piele/anastasia-paleta"],
    ["product", "ro", "https://vizaje-nica.com/ro/catalog/ten-piele/anastasia-paleta"],
  ] as const)("accepts the %s %s shared catalog route without inferring entity identity", (linkType, _locale, targetUrl) => {
    const parsed = parseReferralDestination(targetUrl, linkType)
    expect(parsed.targetPath).toBe(new URL(targetUrl).pathname)
    expect(parsed.targetHost).toBe("vizaje-nica.com")
  })

  test("keeps shared catalog types distinct and rejects invalid shapes or unsafe paths", () => {
    expect(() => parseReferralDestination("https://vizaje-nica.com/ro/catalog/ten-piele", "product")).toThrow(InvalidReferralDestinationError)
    expect(() => parseReferralDestination("https://vizaje-nica.com/ro/catalog/ten-piele/anastasia-paleta", "brand")).toThrow(InvalidReferralDestinationError)
    expect(() => parseReferralDestination("https://example.com/ro/catalog/anastasia-beverly-hills", "brand")).toThrow(InvalidReferralDestinationError)
    expect(() => parseReferralDestination("https://vizaje-nica.com/ro/catalog/%2e%2e/brand", "brand")).toThrow(InvalidReferralDestinationError)
    expect(() => parseReferralDestination("https://vizaje-nica.com/ro/catalog/ten-piele/../brand", "brand")).toThrow(InvalidReferralDestinationError)
    expect(() => parseReferralDestination("https://vizaje-nica.com/ro/catalog/brand/%2fproduct", "product")).toThrow(InvalidReferralDestinationError)
  })

  test("validates versioned order events and rejects unknown event types", () => {
    const valid = referralOrderEventV1Schema.safeParse({
      eventId: crypto.randomUUID(),
      eventVersion: "v1",
      eventType: "order.created",
      occurredAt: new Date().toISOString(),
      orderId: "order-pure-test",
      referralCode: "ABCDEFGH23",
      creatorId: "CRE-000001",
      amount: "100.00",
      currency: "MDL",
    })
    expect(valid.success).toBe(true)
    expect(referralOrderEventV1Schema.safeParse({ ...valid.data, eventType: "order.refunded" }).success).toBe(false)
  })

  test("keeps creator access outside administrator permissions", () => {
    expect(hasPermission("super_admin", "finance:write")).toBe(true)
    expect(hasPermission("finance", "finance:read")).toBe(true)
    expect(hasPermission("analyst", "finance:read")).toBe(false)
    expect(hasPermission("analyst", "users:manage")).toBe(false)
  })

  test("marks ambiguous provider failures for reconciliation", () => {
    expect(hasAmbiguousDeliveryOutcome("Email provider request timed out.")).toBe(true)
    expect(hasAmbiguousDeliveryOutcome("Email provider returned HTTP 503.")).toBe(true)
    expect(hasAmbiguousDeliveryOutcome(EMAIL_RECONCILIATION_REQUIRED)).toBe(true)
    expect(hasAmbiguousDeliveryOutcome("Email provider returned HTTP 400.")).toBe(false)
  })

  test("keeps audit log entries for four days", () => {
    const now = new Date("2026-11-05T12:00:00.000Z")
    const cutoff = getAuditLogRetentionCutoff(now)
    expect(AUDIT_LOG_RETENTION_DAYS).toBe(4)
    expect(cutoff.toISOString()).toBe("2026-11-01T12:00:00.000Z")
  })

  test("rejects disabled modules in the API middleware", async () => {
    const previous = process.env.PAYOUTS_ENABLED
    process.env.PAYOUTS_ENABLED = "false"
    try {
      const guarded = new Hono<ApiEnv>()
      guarded.use("*", requireFeature("PAYOUTS_ENABLED"))
      guarded.post("/payouts", (c) => c.json({ ok: true }))
      const response = await guarded.fetch(new Request("http://localhost/payouts", { method: "POST" }))
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ error: { code: "FEATURE_DISABLED" } })
    } finally {
      if (previous === undefined) delete process.env.PAYOUTS_ENABLED
      else process.env.PAYOUTS_ENABLED = previous
    }
  })
})
