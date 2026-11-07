import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { hashPassword } from "better-auth/crypto"
import { eq, inArray } from "drizzle-orm"
import {
  applicationReviews,
  auditLogs,
  authAccounts,
  authSessions,
  creatorApplications,
  emailDeliveries,
  getDb,
  partnerAccounts,
  partnerAgreements,
  partnerInvitations,
  partners,
  users,
} from "@vizaje/db"
import { app } from "../src/index"
import { logger } from "../src/logger"
import { dispatchDueEmailDeliveries } from "../src/modules/applications/email-delivery"

const db = getDb()
const adminEmail = `m3-${crypto.randomUUID()}@vizaje.local`
const adminPassword = "M3-fixture-password-2026"
const lifecycleEmail = `creator-${crypto.randomUUID()}@example.invalid`
const rejectionEmail = `rejected-${crypto.randomUUID()}@example.invalid`
const retryEmail = `retry-${crypto.randomUUID()}@example.invalid`
const expiredEmail = `expired-${crypto.randomUUID()}@example.invalid`
let adminId = ""
let creatorUserId = ""
let adminCookie = ""
let creatorCookie = ""
let approvedApplicationId = ""
let approvedPartnerId = ""
let rejectedApplicationId = ""
let retryApplicationId = ""
let expiredApplicationId = ""
let expiredPartnerId = ""
let phoneCounter = 0
let failNextProviderResponse = false
const createdApplicationIds: string[] = []
const createdPartnerIds: string[] = []
const providerCalls: Array<{ key: string; body: Record<string, unknown> }> = []
const capturedLogArguments: unknown[][] = []
const loggerDescriptors = new Map<string, PropertyDescriptor | undefined>()
const originalFetch = globalThis.fetch
const originalResendApiKey = process.env.RESEND_API_KEY

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost:3001${path}`, init))
}

function sessionCookie(response: Response) {
  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  const cookie = setCookies.find((value) => value.startsWith("better-auth.session_token=")) ?? response.headers.get("set-cookie")
  if (!cookie) throw new Error("Expected a session cookie")
  return cookie.split(";", 1)[0]
}

async function localEmailSink(input: Request | URL | string, init?: RequestInit) {
  const url = input instanceof Request ? input.url : String(input)
  if (url !== "https://api.resend.com/emails") throw new Error("Blocked non-test outbound request")

  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  const key = headers.get("Idempotency-Key") ?? ""
  const rawBody = init?.body ?? (input instanceof Request ? await input.clone().text() : "")
  const body = JSON.parse(String(rawBody)) as Record<string, unknown>
  providerCalls.push({ key, body })

  if (failNextProviderResponse) {
    failNextProviderResponse = false
    return new Response(JSON.stringify({ message: "local provider failure" }), { status: 503 })
  }
  return new Response(JSON.stringify({ id: `local_${providerCalls.length}` }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

async function submitApplication(email: string, overrides: Record<string, unknown> = {}) {
  phoneCounter += 1
  return request("/v1/applications", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${phoneCounter}` },
    body: JSON.stringify({
      fullName: "Анна Creator",
      email,
      phone: `+37368${String(phoneCounter).padStart(6, "0")}`,
      dateOfBirth: "1996-04-12",
      audienceSize: "under_1000",
      partnershipFormat: "both",
      instagram: "https://instagram.com/anna.creator",
      tiktok: "",
      otherSocial: "",
      contentDescription: "Создаю честный контент о beauty-продуктах.",
      partnershipReason: "Хочу делиться рекомендациями Vizaje-Nica.",
      consent: true,
      locale: "ru",
      ...overrides,
    }),
  })
}

async function applicationIdFor(email: string) {
  const rows = await db.select({ id: creatorApplications.id }).from(creatorApplications).where(eq(creatorApplications.email, email)).limit(1)
  const id = rows[0]?.id
  if (!id) throw new Error("Expected the test application to be persisted")
  if (!createdApplicationIds.includes(id)) createdApplicationIds.push(id)
  return id
}

async function deliveryFor(applicationId: string, eventType: "submitted" | "in_review" | "approved" | "rejected") {
  const rows = await db.select().from(emailDeliveries).where(eq(emailDeliveries.applicationId, applicationId))
  const delivery = rows.find((row) => row.eventType === eventType)
  if (!delivery) throw new Error(`Expected ${eventType} email delivery`) 
  return delivery
}

async function waitForDelivery(
  applicationId: string,
  eventType: "submitted" | "in_review" | "approved" | "rejected",
  status: "sent" | "queued" | "failed",
  predicate: (delivery: { status: string; attemptCount: number; lastError: string | null }) => boolean = () => true,
) {
  const timeoutAt = Date.now() + 5000
  while (Date.now() < timeoutAt) {
    const rows = await db.select().from(emailDeliveries).where(eq(emailDeliveries.applicationId, applicationId))
    const delivery = rows.find((row) => row.eventType === eventType)
    if (delivery?.status === status && predicate(delivery)) return delivery
    await Bun.sleep(20)
  }
  throw new Error(`Timed out waiting for ${eventType} delivery to become ${status}`)
}

function providerCallFor(eventKey: string) {
  const call = providerCalls.find((entry) => entry.key === eventKey)
  if (!call) throw new Error("Expected the local email sink to receive the event")
  return call
}

function activationTokenFromEmail(call: { body: Record<string, unknown> }) {
  const html = String(call.body.html ?? "")
  const match = html.match(/\/activate\?token=([a-f0-9]{64})/i)
  if (!match) throw new Error("The approved email did not contain an activation link")
  return match[1]!
}

function captureLoggerCalls() {
  for (const method of ["info", "warn", "error"] as const) {
    loggerDescriptors.set(method, Object.getOwnPropertyDescriptor(logger, method))
    Object.defineProperty(logger, method, {
      configurable: true,
      writable: true,
      value: (...args: unknown[]) => { capturedLogArguments.push(args) },
    })
  }
}

function restoreLoggerCalls() {
  for (const [method, descriptor] of loggerDescriptors) {
    if (descriptor) Object.defineProperty(logger, method, descriptor)
  }
}

beforeAll(async () => {
  process.env.RESEND_API_KEY = "re_local_test_sink_never_sent"
  globalThis.fetch = localEmailSink as typeof fetch
  captureLoggerCalls()

  adminId = crypto.randomUUID()
  const now = new Date()
  await db.insert(users).values({ id: adminId, email: adminEmail, name: "M3 Admin", emailVerified: true, role: "super_admin", isActive: true, createdAt: now, updatedAt: now })
  await db.insert(authAccounts).values({ id: crypto.randomUUID(), accountId: adminId, providerId: "credential", userId: adminId, password: await hashPassword(adminPassword), createdAt: now, updatedAt: now })
  const login = await request("/v1/auth/sign-in/email", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "x-real-ip": `198.51.100.${++phoneCounter}`, "content-type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  })
  expect(login.status).toBe(200)
  adminCookie = sessionCookie(login)
})

afterAll(async () => {
  restoreLoggerCalls()
  globalThis.fetch = originalFetch
  if (originalResendApiKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = originalResendApiKey

  if (creatorUserId) {
    await db.delete(auditLogs).where(eq(auditLogs.actorUserId, creatorUserId))
    await db.delete(authSessions).where(eq(authSessions.userId, creatorUserId))
    await db.delete(authAccounts).where(eq(authAccounts.userId, creatorUserId))
    await db.delete(partnerAccounts).where(eq(partnerAccounts.userId, creatorUserId))
    await db.delete(users).where(eq(users.id, creatorUserId))
  }
  if (adminId) await db.delete(auditLogs).where(eq(auditLogs.actorUserId, adminId))

  if (createdApplicationIds.length) {
    await db.delete(applicationReviews).where(inArray(applicationReviews.applicationId, createdApplicationIds))
    await db.delete(creatorApplications).where(inArray(creatorApplications.id, createdApplicationIds))
  }
  const partnerIds = [...new Set([...createdPartnerIds, approvedPartnerId, expiredPartnerId].filter(Boolean))]
  if (partnerIds.length) {
    await db.delete(partnerAgreements).where(inArray(partnerAgreements.partnerId, partnerIds))
    await db.delete(partnerInvitations).where(inArray(partnerInvitations.partnerId, partnerIds))
    await db.delete(partnerAccounts).where(inArray(partnerAccounts.partnerId, partnerIds))
    await db.delete(partners).where(inArray(partners.id, partnerIds))
  }
  if (adminId) {
    await db.delete(authSessions).where(eq(authSessions.userId, adminId))
    await db.delete(authAccounts).where(eq(authAccounts.userId, adminId))
    await db.delete(users).where(eq(users.id, adminId))
  }
})

describe("M3.1 creator application lifecycle", () => {
  test("submits without exposing application existence and encrypts the receipt payload", async () => {
    const response = await submitApplication(lifecycleEmail, { phone: "00373 (68) 123-456" })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ submitted: true })
    approvedApplicationId = await applicationIdFor(lifecycleEmail)

    const duplicate = await submitApplication(lifecycleEmail)
    expect(duplicate.status).toBe(201)
    expect(await duplicate.json()).toEqual({ submitted: true })
    const allApplications = await db.select().from(creatorApplications).where(eq(creatorApplications.email, lifecycleEmail))
    expect(allApplications).toHaveLength(1)
    expect(allApplications[0]?.phone).toBe("+37368123456")
    expect(allApplications[0]?.status).toBe("pending")

    const receipt = await waitForDelivery(approvedApplicationId, "submitted", "sent")
    expect(receipt.encryptedPayload).not.toContain("Заявка получена")
    expect(receipt.encryptedPayload).not.toContain(lifecycleEmail)
    expect(providerCallFor(receipt.eventKey).body.subject).toContain("Мы получили вашу заявку")
  })

  test("sends review-started only once and approval creates one hashed, expiring activation invitation", async () => {
    const firstReview = await request(`/v1/admin/applications/${approvedApplicationId}/start-review`, { method: "POST", headers: { cookie: adminCookie } })
    const repeatedReview = await request(`/v1/admin/applications/${approvedApplicationId}/start-review`, { method: "POST", headers: { cookie: adminCookie } })
    expect(firstReview.status).toBe(200)
    expect(await firstReview.json()).toEqual({ idempotent: false })
    expect(await repeatedReview.json()).toEqual({ idempotent: true })
    await waitForDelivery(approvedApplicationId, "in_review", "sent")

    const reviewDeliveries = (await db.select().from(emailDeliveries).where(eq(emailDeliveries.applicationId, approvedApplicationId))).filter((row) => row.eventType === "in_review")
    expect(reviewDeliveries).toHaveLength(1)

    const responses = await Promise.all([
      request(`/v1/admin/applications/${approvedApplicationId}/approve`, { method: "POST", headers: { cookie: adminCookie } }),
      request(`/v1/admin/applications/${approvedApplicationId}/approve`, { method: "POST", headers: { cookie: adminCookie } }),
    ])
    expect(responses.every((response) => response.status === 200)).toBe(true)
    const bodies = await Promise.all(responses.map((response) => response.json() as Promise<{ idempotent: boolean; partner?: { id: string; creatorId: string } }>))
    expect(bodies.filter((body) => body.idempotent).length).toBe(1)
    approvedPartnerId = bodies.find((body) => body.partner)?.partner?.id ?? ""
    createdPartnerIds.push(approvedPartnerId)

    const partnerRows = await db.select().from(partners).where(eq(partners.id, approvedPartnerId)).limit(1)
    expect(partnerRows[0]?.creatorId).toMatch(/^CRE-\d{6}$/)
    const invitations = await db.select().from(partnerInvitations).where(eq(partnerInvitations.partnerId, approvedPartnerId))
    expect(invitations).toHaveLength(1)
    expect(invitations[0]?.status).toBe("pending")
    expect(invitations[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(invitations[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(invitations[0]!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const approvedEmail = await waitForDelivery(approvedApplicationId, "approved", "sent")
    const detail = await request(`/v1/admin/applications/${approvedApplicationId}`, { headers: { cookie: adminCookie } })
    expect(detail.status).toBe(200)
    const detailBody = await detail.json() as { emailDeliveries: Array<Record<string, unknown>> }
    expect(detailBody.emailDeliveries.every((delivery) => !("encryptedPayload" in delivery))).toBe(true)
    expect(approvedEmail.encryptedPayload).not.toContain(lifecycleEmail)

    const emailQueue = await request("/v1/admin/email-deliveries?status=sent", { headers: { cookie: adminCookie } })
    expect(emailQueue.status).toBe(200)
    const emailQueueBody = await emailQueue.json() as { deliveries: Array<{ delivery: Record<string, unknown> }> }
    expect(emailQueueBody.deliveries.every(({ delivery }) => !("encryptedPayload" in delivery))).toBe(true)
  })

  test("activates once, creates a password, logs in, and keeps retry operations admin-only", async () => {
    const delivery = await deliveryFor(approvedApplicationId, "approved")
    const token = activationTokenFromEmail(providerCallFor(delivery.eventKey))
    const invalid = await request("/v1/applications/activate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "198.51.100.241" },
      body: JSON.stringify({ token: "f".repeat(64), password: "Creator-password-2026" }),
    })
    expect(invalid.status).toBe(400)
    expect((await invalid.json() as { error: { message: string } }).error.message).toContain("недействительна или срок её действия истёк")

    const activation = await request("/v1/applications/activate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "198.51.100.242" },
      body: JSON.stringify({ token, password: "Creator-password-2026" }),
    })
    expect(activation.status).toBe(200)
    expect(await activation.json()).toEqual({ activated: true })

    const invitation = (await db.select().from(partnerInvitations).where(eq(partnerInvitations.partnerId, approvedPartnerId)).limit(1))[0]!
    const tokenDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
    const expectedHash = Array.from(new Uint8Array(tokenDigest), (byte) => byte.toString(16).padStart(2, "0")).join("")
    expect(invitation.tokenHash).toBe(expectedHash)
    expect(invitation.status).toBe("accepted")
    expect(invitation.acceptedAt).toBeInstanceOf(Date)

    const secondActivation = await request("/v1/applications/activate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "198.51.100.243" },
      body: JSON.stringify({ token, password: "Another-password-2026" }),
    })
    expect(secondActivation.status).toBe(400)

    const login = await request("/v1/auth/sign-in/email", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json", "x-real-ip": "198.51.100.244" },
      body: JSON.stringify({ email: lifecycleEmail, password: "Creator-password-2026" }),
    })
    expect(login.status).toBe(200)
    creatorCookie = sessionCookie(login)
    creatorUserId = (await db.select({ id: users.id }).from(users).where(eq(users.email, lifecycleEmail)).limit(1))[0]?.id ?? ""
    expect(creatorUserId).not.toBe("")

    const partnerAccess = await request("/v1/partner/referral-links", { headers: { cookie: creatorCookie } })
    expect(partnerAccess.status).toBe(200)
    const adminRetry = await request(`/v1/admin/applications/${approvedApplicationId}/email-deliveries/${delivery.id}/retry`, { method: "POST" })
    expect(adminRetry.status).toBe(401)
    const creatorRetry = await request(`/v1/admin/applications/${approvedApplicationId}/email-deliveries/${delivery.id}/retry`, { method: "POST", headers: { cookie: creatorCookie } })
    expect(creatorRetry.status).toBe(403)
    expect(JSON.stringify(capturedLogArguments)).not.toContain(token)
  })

  test("rejects expired activation links and sends one safe rejection notification", async () => {
    const created = await submitApplication(expiredEmail)
    expect(created.status).toBe(201)
    expiredApplicationId = await applicationIdFor(expiredEmail)
    const approval = await request(`/v1/admin/applications/${expiredApplicationId}/approve`, { method: "POST", headers: { cookie: adminCookie } })
    expect(approval.status).toBe(200)
    expiredPartnerId = (await db.select({ id: partners.id }).from(partners).where(eq(partners.email, expiredEmail)).limit(1))[0]?.id ?? ""
    createdPartnerIds.push(expiredPartnerId)
    const expiredDelivery = await waitForDelivery(expiredApplicationId, "approved", "sent")
    const expiredToken = activationTokenFromEmail(providerCallFor(expiredDelivery.eventKey))
    await db.update(partnerInvitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(partnerInvitations.partnerId, expiredPartnerId))
    const expiredActivation = await request("/v1/applications/activate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "198.51.100.245" },
      body: JSON.stringify({ token: expiredToken, password: "Creator-password-2026" }),
    })
    expect(expiredActivation.status).toBe(400)

    const rejected = await submitApplication(rejectionEmail, { fullName: "Rejected Creator", phone: "+37368123457" })
    expect(rejected.status).toBe(201)
    rejectedApplicationId = await applicationIdFor(rejectionEmail)
    const reason = "Профиль пока не соответствует формату программы."
    const rejection = await request(`/v1/admin/applications/${rejectedApplicationId}/reject`, {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    })
    const repeatedRejection = await request(`/v1/admin/applications/${rejectedApplicationId}/reject`, {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    })
    expect(rejection.status).toBe(200)
    expect((await repeatedRejection.json() as { idempotent: boolean }).idempotent).toBe(true)
    const reviews = await db.select().from(applicationReviews).where(eq(applicationReviews.applicationId, rejectedApplicationId))
    expect(reviews.filter((entry) => entry.action === "rejected")).toHaveLength(1)
    const rejectedDeliveries = (await db.select().from(emailDeliveries).where(eq(emailDeliveries.applicationId, rejectedApplicationId))).filter((entry) => entry.eventType === "rejected")
    expect(rejectedDeliveries).toHaveLength(1)
    const rejectedEmail = await waitForDelivery(rejectedApplicationId, "rejected", "sent")
    const rejectedCall = providerCallFor(rejectedEmail.eventKey)
    expect(rejectedCall.body.text).toContain(reason)
    expect(rejectedCall.body.html).toContain(reason)

    const forbiddenApproval = await request(`/v1/admin/applications/${rejectedApplicationId}/approve`, { method: "POST", headers: { cookie: adminCookie } })
    expect(forbiddenApproval.status).toBe(409)
    expect(JSON.stringify(capturedLogArguments)).not.toContain(expiredToken)
  })

  test("retries a temporary provider failure with the same idempotency key and blocks uncertain retries after 24 hours", async () => {
    failNextProviderResponse = true
    const created = await submitApplication(retryEmail)
    expect(created.status).toBe(201)
    retryApplicationId = await applicationIdFor(retryEmail)
    let failedDelivery = await waitForDelivery(retryApplicationId, "submitted", "queued", (delivery) => delivery.attemptCount === 1 && delivery.lastError === "Email provider returned HTTP 503.")
    expect(failedDelivery.attemptCount).toBe(1)
    expect(failedDelivery.lastError).toBe("Email provider returned HTTP 503.")

    await db.update(emailDeliveries).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(emailDeliveries.id, failedDelivery.id))
    await dispatchDueEmailDeliveries()
    failedDelivery = await waitForDelivery(retryApplicationId, "submitted", "sent")
    const retryCalls = providerCalls.filter((call) => call.key === failedDelivery.eventKey)
    expect(retryCalls).toHaveLength(2)
    expect(retryCalls[0]?.body).toEqual(retryCalls[1]?.body)

    const providerCallCount = providerCalls.length
    await db.update(emailDeliveries).set({
      status: "queued",
      attemptCount: 1,
      nextAttemptAt: new Date(Date.now() - 1000),
      firstProviderAttemptAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      lastError: "Email provider request timed out.",
      sentAt: null,
      providerMessageId: null,
    }).where(eq(emailDeliveries.id, failedDelivery.id))
    await dispatchDueEmailDeliveries()
    const blockedDelivery = await waitForDelivery(retryApplicationId, "submitted", "failed")
    expect(blockedDelivery.lastError).toContain("manual reconciliation is required")
    expect(providerCalls).toHaveLength(providerCallCount)

    const manualRetry = await request(`/v1/admin/applications/${retryApplicationId}/email-deliveries/${failedDelivery.id}/retry`, { method: "POST", headers: { cookie: adminCookie } })
    expect(manualRetry.status).toBe(409)
    expect((await manualRetry.json() as { error: { code: string } }).error.code).toBe("EMAIL_IDEMPOTENCY_WINDOW_ELAPSED")
    expect(JSON.stringify(capturedLogArguments)).not.toContain("token")
  })
})

describe("partner moderation and commission history", () => {
  test("records status changes and preserves agreement history", async () => {
    const statusResponse = await request(`/v1/admin/partners/${approvedPartnerId}/status`, {
      method: "PATCH",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "suspended", reason: "Нужна дополнительная проверка профиля." }),
    })
    expect(statusResponse.status).toBe(200)
    const firstAgreement = await request(`/v1/admin/partners/${approvedPartnerId}/agreements`, {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ commissionRate: 10, startsAt: "2026-11-03", reason: "Стандартная ставка для нового creator." }),
    })
    expect(firstAgreement.status).toBe(201)
    const secondAgreement = await request(`/v1/admin/partners/${approvedPartnerId}/agreements`, {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ commissionRate: 12.5, startsAt: "2026-12-01", reason: "Пересмотр условий после согласования." }),
    })
    expect(secondAgreement.status).toBe(201)
    const agreements = await db.select().from(partnerAgreements).where(eq(partnerAgreements.partnerId, approvedPartnerId))
    expect(agreements).toHaveLength(2)
    expect(agreements.filter((agreement) => agreement.status === "expired")).toHaveLength(1)
    const activeAgreementList = await request("/v1/admin/agreements?status=active", { headers: { cookie: adminCookie } })
    expect(activeAgreementList.status).toBe(200)
    const activeAgreementBody = await activeAgreementList.json() as { agreements: Array<{ agreement: { status: string; commissionRate: string }; partner: { id: string } }> }
    expect(activeAgreementBody.agreements).toHaveLength(1)
    expect(activeAgreementBody.agreements[0]).toMatchObject({ agreement: { status: "active", commissionRate: "12.50" }, partner: { id: approvedPartnerId } })
    const audit = await db.select().from(auditLogs).where(eq(auditLogs.entityId, approvedPartnerId))
    expect(audit.some((entry) => entry.action === "PARTNER_STATUS_CHANGED")).toBe(true)
    expect(audit.some((entry) => entry.action === "PARTNER_COMMISSION_AGREEMENT_CREATED")).toBe(true)
    const auditResponse = await request("/v1/admin/audit", { headers: { cookie: adminCookie } })
    expect(auditResponse.status).toBe(200)
    expect((await auditResponse.json() as { entries: Array<{ entityId: string | null }> }).entries.some((entry) => entry.entityId === approvedPartnerId)).toBe(true)
  })
})
