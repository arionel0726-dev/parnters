import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { hashPassword } from "better-auth/crypto"
import { eq, inArray } from "drizzle-orm"
import { apiRateLimits, auditLogs, authAccounts, authSessions, getDb, partnerAccounts, partnerAgreements, partners, payouts, referralLinkClicks, referralLinks, referralOrders, users } from "@vizaje/db"
import { getApiEnv } from "../src/env"
import { app } from "../src/index"

process.env.CREATOR_FINANCE_ENABLED = "true"
process.env.PAYOUTS_ENABLED = "true"
process.env.REFERRAL_TRACKING_ENABLED = "true"

const db = getDb()
const adminEmail = `referral-admin-${crypto.randomUUID()}@vizaje.local`
const partnerEmail = `referral-creator-${crypto.randomUUID()}@example.com`
const otherPartnerEmail = `referral-other-${crypto.randomUUID()}@example.com`
const adminPassword = "Referral-admin-password-2026"
const partnerPassword = "Referral-partner-password-2026"
const serviceToken = getApiEnv().REFERRAL_SERVICE_TOKEN
let adminId = ""
let partnerUserId = ""
let otherPartnerUserId = ""
let partnerId = ""
let otherPartnerId = ""
let adminCookie = ""
let partnerCookie = ""
let otherPartnerCookie = ""
let activeLinkId = ""
let activeCode = ""
let expiredLinkId = ""

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost:3001${path}`, init))
}

function sessionCookie(response: Response) {
  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  const cookie = setCookies.find((value) => value.startsWith("better-auth.session_token=")) ?? response.headers.get("set-cookie")
  if (!cookie) throw new Error("Expected a session cookie")
  return cookie.split(";", 1)[0]
}

async function createUser(id: string, email: string, password: string, role: "super_admin" | "analyst") {
  const now = new Date()
  await db.insert(users).values({ id, email, name: email.split("@")[0], emailVerified: true, role, isActive: true, createdAt: now, updatedAt: now })
  await db.insert(authAccounts).values({ id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(password), createdAt: now, updatedAt: now })
}

async function login(email: string, password: string) {
  const ip = email.startsWith("referral-admin") ? "10.10.0.21" : email.startsWith("referral-other") ? "10.10.0.23" : "10.10.0.22"
  const response = await request("/v1/auth/sign-in/email", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "x-forwarded-for": ip, "x-real-ip": ip, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  expect(response.status).toBe(200)
  return sessionCookie(response)
}

function partnerRequest(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set("cookie", partnerCookie)
  return request(path, { ...init, headers })
}

function serviceValidate(code: string, token = serviceToken) {
  return request("/v1/internal/referral-links/validate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-service-token": token },
    body: JSON.stringify({ code }),
  })
}

beforeAll(async () => {
  adminId = crypto.randomUUID()
  partnerUserId = crypto.randomUUID()
  otherPartnerUserId = crypto.randomUUID()
  partnerId = crypto.randomUUID()
  otherPartnerId = crypto.randomUUID()
  const now = new Date()
  await createUser(adminId, adminEmail, adminPassword, "super_admin")
  await createUser(partnerUserId, partnerEmail, partnerPassword, "analyst")
  await createUser(otherPartnerUserId, otherPartnerEmail, partnerPassword, "analyst")
  await db.insert(partners).values([
    { id: partnerId, creatorId: "CRE-000001", displayName: "Referral Creator", email: partnerEmail, phone: "+37360000001", type: "creator", status: "active", tier: "starter", createdAt: now, updatedAt: now },
    { id: otherPartnerId, creatorId: "CRE-000002", displayName: "Other Creator", email: otherPartnerEmail, phone: "+37360000002", type: "creator", status: "active", tier: "starter", createdAt: now, updatedAt: now },
  ])
  await db.insert(partnerAccounts).values([
    { userId: partnerUserId, partnerId, createdAt: now, updatedAt: now },
    { userId: otherPartnerUserId, partnerId: otherPartnerId, createdAt: now, updatedAt: now },
  ])
  adminCookie = await login(adminEmail, adminPassword)
  partnerCookie = await login(partnerEmail, partnerPassword)
  otherPartnerCookie = await login(otherPartnerEmail, partnerPassword)
})

afterAll(async () => {
  const userIds = [adminId, partnerUserId, otherPartnerUserId]
  const partnerIds = [partnerId, otherPartnerId]
  await db.delete(auditLogs).where(inArray(auditLogs.actorUserId, userIds))
  await db.delete(auditLogs).where(inArray(auditLogs.entityId, partnerIds))
  await db.delete(payouts).where(inArray(payouts.partnerId, partnerIds))
  await db.delete(referralOrders).where(inArray(referralOrders.partnerId, partnerIds))
  await db.delete(referralLinkClicks).where(inArray(referralLinkClicks.partnerId, partnerIds))
  await db.delete(partnerAgreements).where(inArray(partnerAgreements.partnerId, partnerIds))
  await db.delete(referralLinks).where(inArray(referralLinks.partnerId, partnerIds))
  await db.delete(partnerAccounts).where(inArray(partnerAccounts.partnerId, partnerIds))
  await db.delete(partners).where(inArray(partners.id, partnerIds))
  await db.delete(apiRateLimits).where(inArray(apiRateLimits.bucketKey, partnerIds.map((id) => `creator-link-create:${id}`)))
  await db.delete(authSessions).where(inArray(authSessions.userId, userIds))
  await db.delete(authAccounts).where(inArray(authAccounts.userId, userIds))
  await db.delete(users).where(inArray(users.id, userIds))
})

describe("creator dashboard and referral links", () => {
  test("requires an authenticated creator and separates administrator access", async () => {
    expect((await request("/v1/partner/referral-links")).status).toBe(401)
    expect((await partnerRequest("/v1/partner/dashboard")).status).toBe(200)
    expect((await request("/v1/partner/dashboard", { headers: { cookie: adminCookie } })).status).toBe(403)
  })

  test("returns only real dashboard, identity and link summary data", async () => {
    const response = await partnerRequest("/v1/partner/dashboard")
    expect(response.status).toBe(200)
    const body = await response.json() as { profile: { creatorId: string; email: string; status: string }; links: { total: number; active: number; revoked: number; expired: number } }
    expect(body.profile.creatorId).toBe("CRE-000001")
    expect(body.profile.email).toBe(partnerEmail)
    expect(body.profile.status).toBe("active")
    expect(body.links).toEqual({ total: 0, active: 0, revoked: 0, expired: 0 })
    expect("orders" in body).toBe(false)
  })

  test("updates only approved profile fields and rejects identity or permission changes", async () => {
    const invalid = await partnerRequest("/v1/partner/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Changed Creator", phone: "+37360000001", status: "banned" }),
    })
    expect(invalid.status).toBe(400)

    const response = await partnerRequest("/v1/partner/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Referral Creator Updated", phone: "+37360000001", instagram: "instagram.com/referral.creator", tiktok: null, otherSocial: null }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { profile: { displayName: string; email: string; instagram: string | null; creatorId: string } }
    expect(body.profile.displayName).toBe("Referral Creator Updated")
    expect(body.profile.email).toBe(partnerEmail)
    expect(body.profile.instagram).toBe("https://instagram.com/referral.creator")
    expect(body.profile.creatorId).toBe("CRE-000001")
  })

  test("creates an opaque link with internal label, expiry and localized destination", async () => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString()
    const response = await partnerRequest("/v1/partner/referral-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ linkType: "homepage", targetUrl: "https://vizaje-nica.com/ro/", label: "Rutina mea de îngrijire", expiresAt }),
    })
    expect(response.status).toBe(201)
    const body = await response.json() as { link: { id: string; code: string; label: string; targetPath: string; shortUrl: string; status: string; isExpired: boolean; expiresAt: string | null } }
    activeLinkId = body.link.id
    activeCode = body.link.code
    expect(body.link.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)
    expect(body.link.code).not.toContain("CRE")
    expect(body.link.label).toBe("Rutina mea de îngrijire")
    expect(body.link.targetPath).toBe("/ro/")
    expect(body.link.shortUrl).toMatch(/\/r\/[A-HJ-NP-Z2-9]{10}$/)
    expect(body.link.status).toBe("active")
    expect(body.link.isExpired).toBe(false)
    expect(body.link.expiresAt).toBe(expiresAt)
  })

  test("creates, stores and resolves shared catalog brand, category and product links", async () => {
    const cases = [
      { linkType: "brand", targetUrl: "https://vizaje-nica.com/ro/catalog/anastasia-beverly-hills" },
      { linkType: "category", targetUrl: "https://vizaje-nica.com/ru/catalog/ten-piele" },
      { linkType: "product", targetUrl: "https://vizaje-nica.com/ro/catalog/ten-piele/anastasia-paleta" },
    ] as const
    const createdIds: string[] = []
    const createdCodes: string[] = []

    try {
      for (const input of cases) {
        const response = await partnerRequest("/v1/partner/referral-links", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        })
        expect(response.status).toBe(201)
        const body = await response.json() as { link: { id: string; code: string; linkType: string; targetPath: string; targetUrl: string } }
        createdIds.push(body.link.id)
        createdCodes.push(body.link.code)
        expect(body.link).toMatchObject({ linkType: input.linkType, targetPath: new URL(input.targetUrl).pathname, targetUrl: input.targetUrl })

        const detail = await partnerRequest(`/v1/partner/referral-links/${body.link.id}`)
        expect(detail.status).toBe(200)
        expect((await detail.json() as { link: { linkType: string; targetPath: string } }).link).toMatchObject({ linkType: input.linkType, targetPath: new URL(input.targetUrl).pathname })
      }

      for (const [index, code] of createdCodes.entries()) {
        const redirected = await request("/v1/internal/referral-links/click", {
          method: "POST",
          headers: { "content-type": "application/json", "x-service-token": serviceToken },
          body: JSON.stringify({ code }),
        })
        expect(redirected.status).toBe(200)
        const body = await redirected.json() as { valid: boolean; link: { linkType: string; targetUrl: string } }
        expect(body).toMatchObject({ valid: true, link: { linkType: cases[index]!.linkType, targetUrl: cases[index]!.targetUrl } })
      }
    } finally {
      if (createdIds.length) {
        await db.delete(referralLinkClicks).where(inArray(referralLinkClicks.referralLinkId, createdIds))
        await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdIds))
        await db.delete(referralLinks).where(inArray(referralLinks.id, createdIds))
      }
    }
  })

  test("records clicks, ingests an order idempotently and exposes creator finance data", async () => {
    expect((await request("/v1/internal/referral-orders/events", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401)
    const click = await request("/v1/internal/referral-links/click", {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-token": serviceToken, "x-referral-locale": "ro" },
      body: JSON.stringify({ code: activeCode }),
    })
    expect(click.status).toBe(200)
    expect((await click.json() as { valid: boolean }).valid).toBe(true)

    const now = new Date()
    await db.insert(partnerAgreements).values({ partnerId, createdByUserId: adminId, commissionRate: "10.00", startsAt: now.toISOString().slice(0, 10), status: "active", reason: "Referral finance test", createdAt: now, updatedAt: now })

    const event = {
      eventId: crypto.randomUUID(),
      eventVersion: "v1",
      eventType: "order.created",
      occurredAt: now.toISOString(),
      orderId: `order-${crypto.randomUUID()}`,
      referralCode: activeCode,
      creatorId: "CRE-000001",
      amount: "100.00",
      currency: "MDL",
    }
    const first = await request("/v1/internal/referral-orders/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-token": serviceToken },
      body: JSON.stringify(event),
    })
    expect(first.status).toBe(200)
    expect((await first.json() as { idempotent: boolean }).idempotent).toBe(false)

    const repeated = await request("/v1/internal/referral-orders/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-token": serviceToken },
      body: JSON.stringify(event),
    })
    expect(repeated.status).toBe(200)
    expect((await repeated.json() as { idempotent: boolean }).idempotent).toBe(true)

    const updatedEvent = { ...event, eventId: crypto.randomUUID(), eventType: "order.updated", amount: "120.00" }
    const updated = await request("/v1/internal/referral-orders/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-token": serviceToken },
      body: JSON.stringify(updatedEvent),
    })
    expect(updated.status).toBe(200)
    expect((await updated.json() as { idempotent: boolean }).idempotent).toBe(false)

    const analytics = await partnerRequest("/v1/partner/analytics")
    expect(analytics.status).toBe(200)
    const analyticsBody = await analytics.json() as { summary: { clicks: number; orders: number; commission: string; availableByCurrency: Array<{ currency: string; amount: string }> }; orders: Array<{ orderId: string }> }
    expect(analyticsBody.summary.clicks).toBe(1)
    expect(analyticsBody.summary.orders).toBe(1)
    expect(analyticsBody.summary.commission).toBe("12.00")
    expect(analyticsBody.summary.availableByCurrency).toEqual([{ currency: "MDL", amount: "12.00" }])
    expect(analyticsBody.orders).toHaveLength(1)

    const links = await partnerRequest("/v1/partner/referral-links")
    const linkBody = await links.json() as { links: Array<{ id: string; clicks: number; orders: number }> }
    expect(linkBody.links.find((link) => link.id === activeLinkId)).toMatchObject({ clicks: 1, orders: 1 })

    const payout = await partnerRequest("/v1/partner/payouts", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": "referral-payout-test-001" },
      body: JSON.stringify({ amount: 10, currency: "MDL" }),
    })
    expect(payout.status).toBe(201)
    const payoutBody = await payout.json() as { payout: { id: string; status: string; currency: string } }
    expect(payoutBody.payout).toMatchObject({ status: "requested", currency: "MDL" })
    const repeatedPayout = await partnerRequest("/v1/partner/payouts", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": "referral-payout-test-001" },
      body: JSON.stringify({ amount: 10, currency: "MDL" }),
    })
    expect(repeatedPayout.status).toBe(200)
    expect((await repeatedPayout.json() as { idempotent: boolean }).idempotent).toBe(true)
    const concurrent = await Promise.all(["referral-payout-concurrent-a", "referral-payout-concurrent-b"].map((key) => partnerRequest("/v1/partner/payouts", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ amount: 2, currency: "MDL" }),
    })))
    expect(concurrent.map((response) => response.status).sort()).toEqual([201, 409])

    expect((await request("/v1/admin/me", { headers: { cookie: partnerCookie } })).status).toBe(200)
    expect((await request("/v1/admin/overview", { headers: { cookie: partnerCookie } })).status).toBe(403)
    expect((await request("/v1/admin/payouts", { headers: { cookie: partnerCookie } })).status).toBe(403)
    const adminPayouts = await request("/v1/admin/payouts", { headers: { cookie: adminCookie } })
    expect(adminPayouts.status).toBe(200)
    expect((await adminPayouts.json() as { payouts: Array<{ payout: { id: string } }> }).payouts.some((row) => row.payout.id === payoutBody.payout.id)).toBe(true)
    const adminFinance = await request(`/v1/admin/partners/${partnerId}/finance`, { headers: { cookie: adminCookie } })
    expect(adminFinance.status).toBe(200)
    expect((await adminFinance.json() as { summary: { clicks: number; orders: number } }).summary).toMatchObject({ clicks: 1, orders: 1 })

    const approved = await request(`/v1/admin/payouts/${payoutBody.payout.id}/status`, { method: "PATCH", headers: { cookie: adminCookie, "content-type": "application/json" }, body: JSON.stringify({ status: "approved" }) })
    expect(approved.status).toBe(200)
    const paid = await request(`/v1/admin/payouts/${payoutBody.payout.id}/status`, { method: "PATCH", headers: { cookie: adminCookie, "content-type": "application/json" }, body: JSON.stringify({ status: "paid" }) })
    expect(paid.status).toBe(200)

    const cancelled = await request("/v1/internal/referral-orders/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-token": serviceToken },
      body: JSON.stringify({ ...updatedEvent, eventId: crypto.randomUUID(), eventType: "order.cancelled" }),
    })
    expect(cancelled.status).toBe(200)
    const afterCancellation = await partnerRequest("/v1/partner/analytics")
    const afterCancellationBody = await afterCancellation.json() as { summary: { orders: number; commission: string; availableByCurrency: Array<{ currency: string; amount: string }> } }
    expect(afterCancellationBody.summary).toMatchObject({ orders: 0, commission: "0", availableByCurrency: [{ currency: "MDL", amount: "0.00" }] })
  })

  test("resolves an active link without recording analytics when tracking is disabled", async () => {
    const before = await db.select({ id: referralLinkClicks.id }).from(referralLinkClicks).where(eq(referralLinkClicks.referralLinkId, activeLinkId))
    process.env.REFERRAL_TRACKING_ENABLED = "false"

    try {
      const response = await request("/v1/internal/referral-links/click", {
        method: "POST",
        headers: { "content-type": "application/json", "x-service-token": serviceToken, "x-referral-locale": "ro" },
        body: JSON.stringify({ code: activeCode }),
      })
      expect(response.status).toBe(200)
      expect((await response.json() as { valid: boolean; link: { code: string; targetUrl: string } })).toMatchObject({
        valid: true,
        link: { code: activeCode, targetUrl: "https://vizaje-nica.com/ro/" },
      })

      const after = await db.select({ id: referralLinkClicks.id }).from(referralLinkClicks).where(eq(referralLinkClicks.referralLinkId, activeLinkId))
      expect(after).toHaveLength(before.length)
    } finally {
      process.env.REFERRAL_TRACKING_ENABLED = "true"
    }
  })

  test("returns creator link details and prevents cross-creator reads, rename and revoke", async () => {
    const detail = await partnerRequest(`/v1/partner/referral-links/${activeLinkId}`)
    expect(detail.status).toBe(200)
    expect((await detail.json() as { link: { code: string; clicks: number; orders: number } }).link).toMatchObject({ code: activeCode, clicks: 1, orders: 0 })

    const otherDetail = await request(`/v1/partner/referral-links/${activeLinkId}`, { headers: { cookie: otherPartnerCookie } })
    const otherRename = await request(`/v1/partner/referral-links/${activeLinkId}`, { method: "PATCH", headers: { cookie: otherPartnerCookie, "content-type": "application/json" }, body: JSON.stringify({ label: "Not mine" }) })
    const otherRevoke = await request(`/v1/partner/referral-links/${activeLinkId}/revoke`, { method: "PATCH", headers: { cookie: otherPartnerCookie } })
    expect(otherDetail.status).toBe(404)
    expect(otherRename.status).toBe(404)
    expect(otherRevoke.status).toBe(404)

    const renamed = await partnerRequest(`/v1/partner/referral-links/${activeLinkId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: "Sérum de zi" }) })
    expect(renamed.status).toBe(200)
    expect((await renamed.json() as { link: { label: string; clicks: number; orders: number } }).link).toMatchObject({ label: "Sérum de zi", clicks: 1, orders: 0 })
  })

  test("rejects destinations outside the path allowlist, including redirect parameters", async () => {
    const targets = [
      { linkType: "product", targetUrl: "https://example.com/ro/products/serum" },
      { linkType: "brand", targetUrl: "https://vizaje-nica.com/ru/products/serum" },
      { linkType: "homepage", targetUrl: "https://vizaje-nica.com/ro/?redirect=https://example.com" },
    ]
    for (const target of targets) {
      const response = await partnerRequest("/v1/partner/referral-links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(target) })
      expect(response.status).toBe(400)
    }
    const pastExpiry = await partnerRequest("/v1/partner/referral-links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ linkType: "homepage", targetUrl: "https://vizaje-nica.com/ro/", expiresAt: new Date(Date.now() - 60_000).toISOString() }) })
    expect(pastExpiry.status).toBe(400)
  })

  test("database unique constraint rejects duplicate opaque codes", async () => {
    const duplicate = await db.insert(referralLinks).values({
      partnerId,
      code: activeCode,
      label: "duplicate",
      targetProtocol: "https",
      targetHost: "vizaje-nica.com",
      targetPath: "/ro/",
      linkType: "homepage",
      status: "active",
    }).onConflictDoNothing().returning({ id: referralLinks.id })
    expect(duplicate).toHaveLength(0)
  })

  test("rate limits link creation per creator", async () => {
    const responses = await Promise.all(Array.from({ length: 11 }, () => request("/v1/partner/referral-links", {
      method: "POST",
      headers: { cookie: otherPartnerCookie, "content-type": "application/json" },
      body: JSON.stringify({ linkType: "homepage", targetUrl: "https://vizaje-nica.com/ro/" }),
    })))
    expect(responses.filter((response) => response.status === 201)).toHaveLength(10)
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1)
  })

  test("suspended or banned creators cannot use the dashboard, create or resolve links", async () => {
    for (const status of ["suspended", "banned"] as const) {
      await db.update(partners).set({ status }).where(eq(partners.id, partnerId))
      const dashboard = await partnerRequest("/v1/partner/dashboard")
      const create = await partnerRequest("/v1/partner/referral-links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ linkType: "homepage", targetUrl: "https://vizaje-nica.com/ro/" }) })
      const resolve = await serviceValidate(activeCode)
      expect(dashboard.status).toBe(403)
      expect(create.status).toBe(403)
      expect((await resolve.json() as { valid: boolean }).valid).toBe(false)
    }
    await db.update(partners).set({ status: "active" }).where(eq(partners.id, partnerId))
  })

  test("lists only owner links and keeps the administrator endpoint read-only", async () => {
    const partnerResponse = await partnerRequest("/v1/partner/referral-links")
    expect(partnerResponse.status).toBe(200)
    const partnerBody = await partnerResponse.json() as { links: Array<{ id: string }> }
    expect(partnerBody.links.some((link) => link.id === activeLinkId)).toBe(true)

    const adminResponse = await request(`/v1/admin/partners/${partnerId}/referral-links`, { headers: { cookie: adminCookie } })
    expect(adminResponse.status).toBe(200)
    const adminBody = await adminResponse.json() as { links: Array<{ id: string }> }
    expect(adminBody.links).toHaveLength(1)
    expect(adminBody.links[0]?.id).toBe(activeLinkId)
    expect((await request(`/v1/admin/partners/${partnerId}/referral-links`, { method: "DELETE", headers: { cookie: adminCookie } })).status).toBe(404)
  })

  test("protects internal validation, honors expiration and invalidates revoked codes", async () => {
    const unauthorized = await request("/v1/internal/referral-links/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: activeCode }) })
    const invalidToken = await serviceValidate(activeCode, "wrong")
    const invalidClickToken = await request("/v1/internal/referral-links/click", { method: "POST", headers: { "content-type": "application/json", "x-service-token": "wrong" }, body: JSON.stringify({ code: activeCode }) })
    expect(unauthorized.status).toBe(401)
    expect(invalidToken.status).toBe(401)
    expect(invalidClickToken.status).toBe(401)

    const valid = await serviceValidate(activeCode)
    expect(valid.status).toBe(200)
    expect((await valid.json() as { valid: boolean }).valid).toBe(true)

    const createExpiring = await partnerRequest("/v1/partner/referral-links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ linkType: "homepage", targetUrl: "https://vizaje-nica.com/ru/", expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString() }) })
    const expiringBody = await createExpiring.json() as { link: { id: string; code: string } }
    expiredLinkId = expiringBody.link.id
    await db.update(referralLinks).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(referralLinks.id, expiredLinkId))
    const expiredDetail = await partnerRequest(`/v1/partner/referral-links/${expiredLinkId}`)
    expect((await expiredDetail.json() as { link: { isExpired: boolean } }).link.isExpired).toBe(true)
    const expiredValidation = await serviceValidate(expiringBody.link.code)
    expect((await expiredValidation.json() as { valid: boolean }).valid).toBe(false)
    const expiredRedirect = await request("/v1/internal/referral-links/click", {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-token": serviceToken },
      body: JSON.stringify({ code: expiringBody.link.code }),
    })
    expect(expiredRedirect.status).toBe(200)
    expect((await expiredRedirect.json() as { valid: boolean }).valid).toBe(false)

    const revoke = await partnerRequest(`/v1/partner/referral-links/${activeLinkId}/revoke`, { method: "PATCH" })
    expect(revoke.status).toBe(200)
    expect((await revoke.json() as { link: { status: string; clicks: number; orders: number } }).link).toMatchObject({ status: "revoked", clicks: 1, orders: 0 })
    const afterRevoke = await serviceValidate(activeCode)
    expect(afterRevoke.status).toBe(200)
    expect((await afterRevoke.json() as { valid: boolean }).valid).toBe(false)
    const afterRevokeRedirect = await request("/v1/internal/referral-links/click", {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-token": serviceToken },
      body: JSON.stringify({ code: activeCode }),
    })
    expect(afterRevokeRedirect.status).toBe(200)
    expect((await afterRevokeRedirect.json() as { valid: boolean }).valid).toBe(false)
    const repeated = await partnerRequest(`/v1/partner/referral-links/${activeLinkId}/revoke`, { method: "PATCH" })
    expect((await repeated.json() as { idempotent: boolean }).idempotent).toBe(true)
  })
})
