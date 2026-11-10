import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto"
import { hashPassword } from "better-auth/crypto"
import { and, eq, inArray } from "drizzle-orm"
import {
  auditLogs,
  authAccounts,
  authSessions,
  getDb,
  legacyAccountLinkCodes,
  legacyAccountLinkInitiations,
  legacyAccountLinkNonces,
  partnerAccounts,
  partners,
  users,
} from "@vizaje/db"
import { app } from "../src/index"
import { buildAccountLinkCanonicalString } from "../src/modules/account-linking/service-auth"

const redirectUri = "https://dev.vizaje-nica.com/account/creator-link/callback"
const keyId = "legacy-to-partners-test-2026-11"
const secret = randomBytes(32)
const secretBase64Url = secret.toString("base64url")
const password = "M5.3B.1B-account-linking-test-2026"
const createdUserIds: string[] = []
const createdPartnerIds: string[] = []
const createdCodeHashes: string[] = []
const createdTicketHashes: string[] = []

process.env.LEGACY_ACCOUNT_LINK_REDIRECT_URI = redirectUri
process.env.LEGACY_TO_PARTNERS_HMAC_KEYS = JSON.stringify([{ keyId, secret: secretBase64Url, active: true }])

const db = getDb()

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request("http://localhost:3001" + path, init))
}

function sessionCookie(response: Response) {
  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  const cookie = setCookies.find((value) => value.startsWith("better-auth.session_token=")) ?? response.headers.get("set-cookie")
  if (!cookie) throw new Error("Expected a session cookie")
  return cookie.split(";", 1)[0]
}

async function createFixture(input: {
  status?: "active" | "suspended" | "banned"
  type?: "creator" | "referral"
  withPartner?: boolean
}) {
  const userId = randomUUID()
  const email = "account-linking-" + userId + "@vizaje.local"
  const partnerId = randomUUID()
  const now = new Date()
  const withPartner = input.withPartner ?? true
  createdUserIds.push(userId)

  await db.insert(users).values({
    id: userId,
    email,
    name: "Account Linking Fixture",
    emailVerified: true,
    role: "analyst",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(authAccounts).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  })

  if (withPartner) {
    createdPartnerIds.push(partnerId)
    await db.insert(partners).values({
      id: partnerId,
      creatorId: "M53-" + userId.slice(0, 8),
      displayName: "Account Linking Fixture",
      email,
      type: input.type ?? "creator",
      status: input.status ?? "active",
      tier: "starter",
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(partnerAccounts).values({ userId, partnerId, createdAt: now, updatedAt: now })
  }

  const login = await request("/v1/auth/sign-in/email", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "x-forwarded-for": `10.250.${randomBytes(2)[0]}.${randomBytes(2)[0]}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  expect(login.status).toBe(200)
  return { userId, partnerId: withPartner ? partnerId : null, cookie: sessionCookie(login) }
}

function signedLegacy(
  path: "/initiate" | "/exchange" | "/partner-status",
  body: Record<string, string>,
  options: { timestamp?: number; nonce?: string; signature?: string; requestKeyId?: string } = {},
) {
  const rawBody = JSON.stringify(body)
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000))
  const nonce = options.nonce ?? randomBytes(16).toString("base64url")
  const requestKeyId = options.requestKeyId ?? keyId
  const canonical = buildAccountLinkCanonicalString({
    keyId: requestKeyId,
    method: "POST",
    pathAndQuery: `/v1/internal/account-linking${path}`,
    timestamp,
    nonce,
    rawBody,
  })
  const signature = options.signature ?? createHmac("sha256", secret).update(canonical, "utf8").digest("hex")
  return request(`/v1/internal/account-linking${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vp-key-id": requestKeyId,
      "x-vp-timestamp": timestamp,
      "x-vp-nonce": nonce,
      "x-vp-signature": signature,
    },
    body: rawBody,
  })
}

async function initiate(clientId = "12345", state = randomBytes(32).toString("base64url"), uri = redirectUri) {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const response = await signedLegacy("/initiate", { legacyClientId: clientId, redirectUri: uri, codeChallenge: challenge, state })
  const body = await response.json() as { ticket?: string; authorizeUrl?: string; expiresAt?: string }
  if (body.ticket) createdTicketHashes.push(createHash("sha256").update(body.ticket).digest("hex"))
  return { response, body, verifier, state, challenge }
}

function inspect(cookie: string, ticket: string) {
  return request("/v1/partner/account-linking/inspect", {
    method: "POST",
    headers: { origin: "http://localhost:3000", cookie, "content-type": "application/json" },
    body: JSON.stringify({ ticket }),
  })
}

async function confirm(cookie: string, ticket: string, confirmed = true) {
  const response = await request("/v1/partner/account-linking/authorize", {
    method: "POST",
    headers: { origin: "http://localhost:3000", cookie, "content-type": "application/json" },
    body: JSON.stringify({ ticket, confirmed }),
  })
  const body = await response.json() as { callbackUrl?: string; expiresAt?: string }
  if (body.callbackUrl) {
    const callback = new URL(body.callbackUrl)
    const code = callback.searchParams.get("code")
    if (code) createdCodeHashes.push(createHash("sha256").update(code).digest("hex"))
  }
  return { response, body }
}

function signedExchange(
  body: Record<string, string>,
  options: { timestamp?: number; nonce?: string; signature?: string; requestKeyId?: string } = {},
) {
  return signedLegacy("/exchange", body, options)
}

async function cleanFixtureData() {
  if (createdPartnerIds.length) {
    await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "partner"), inArray(auditLogs.entityId, createdPartnerIds)))
    await db.delete(partnerAccounts).where(inArray(partnerAccounts.partnerId, createdPartnerIds))
    await db.delete(partners).where(inArray(partners.id, createdPartnerIds))
  }
  if (createdUserIds.length) {
    await db.delete(authSessions).where(inArray(authSessions.userId, createdUserIds))
    await db.delete(authAccounts).where(inArray(authAccounts.userId, createdUserIds))
    await db.delete(users).where(inArray(users.id, createdUserIds))
  }
  if (createdCodeHashes.length) {
    await db.delete(legacyAccountLinkCodes).where(inArray(legacyAccountLinkCodes.codeHash, createdCodeHashes))
  }
  if (createdTicketHashes.length) {
    await db.delete(legacyAccountLinkInitiations).where(inArray(legacyAccountLinkInitiations.ticketHash, createdTicketHashes))
  }
  await db.delete(legacyAccountLinkNonces).where(eq(legacyAccountLinkNonces.keyId, keyId))
}

beforeAll(async () => {
  await db.delete(legacyAccountLinkNonces).where(eq(legacyAccountLinkNonces.keyId, keyId))
})

afterAll(cleanFixtureData)

describe("Legacy account linking", () => {
  test("requires authentication, trusted Origin and an active creator", async () => {
    const unauthenticated = await request("/v1/partner/account-linking/inspect", { method: "POST" })
    expect(unauthenticated.status).toBe(401)

    const fixture = await createFixture({})
    const initiated = await initiate("client-active")
    expect(initiated.response.status).toBe(201)
    expect(initiated.body.authorizeUrl).toContain("/link/legacy/authorize?ticket=")
    expect(initiated.body.authorizeUrl).not.toContain("client-active")

    const missingOrigin = await request("/v1/partner/account-linking/inspect", {
      method: "POST",
      headers: { cookie: fixture.cookie, "content-type": "application/json" },
      body: JSON.stringify({ ticket: initiated.body.ticket }),
    })
    expect(missingOrigin.status).toBe(403)

    expect((await inspect(fixture.cookie, initiated.body.ticket!)).status).toBe(200)
    const suspended = await createFixture({ status: "suspended" })
    expect((await inspect(suspended.cookie, initiated.body.ticket!)).status).toBe(403)
    const banned = await createFixture({ status: "banned" })
    expect((await inspect(banned.cookie, initiated.body.ticket!)).status).toBe(403)
    const regular = await createFixture({ withPartner: false })
    expect((await inspect(regular.cookie, initiated.body.ticket!)).status).toBe(403)
  })

  test("uses a server-created initiation ticket and rejects browser field injection", async () => {
    const fixture = await createFixture({})
    const initiated = await initiate("client-41")
    expect(initiated.response.status).toBe(201)

    const invalidConfirmation = await request("/v1/partner/account-linking/authorize", {
      method: "POST",
      headers: { origin: "http://localhost:3000", cookie: fixture.cookie, "content-type": "application/json" },
      body: JSON.stringify({ ticket: initiated.body.ticket }),
    })
    expect(invalidConfirmation.status).toBe(400)

    const tampered = await request("/v1/partner/account-linking/authorize", {
      method: "POST",
      headers: { origin: "http://localhost:3000", cookie: fixture.cookie, "content-type": "application/json" },
      body: JSON.stringify({ ticket: initiated.body.ticket, confirmed: true, legacyClientId: "other-client" }),
    })
    expect(tampered.status).toBe(400)

    const confirmed = await confirm(fixture.cookie, initiated.body.ticket!)
    expect(confirmed.response.status).toBe(200)
    const callback = new URL(confirmed.body.callbackUrl!)
    expect(callback.origin + callback.pathname).toBe(redirectUri)
    expect(callback.searchParams.get("state")).toBe(initiated.state)
    expect(callback.searchParams.get("code")).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const consumedInitiation = await db.select().from(legacyAccountLinkInitiations).where(eq(legacyAccountLinkInitiations.ticketHash, createHash("sha256").update(initiated.body.ticket!).digest("hex"))).limit(1)
    expect(consumedInitiation[0]?.legacyClientId).toBeNull()
    expect((await confirm(fixture.cookie, initiated.body.ticket!)).response.status).toBe(400)
  })

  test("rejects an unapproved callback URI, expired ticket and open redirect", async () => {
    const wrongRedirect = await initiate("client-wrong-redirect", randomBytes(32).toString("base64url"), "https://evil.example/account/creator-link/callback")
    expect(wrongRedirect.response.status).toBe(400)

    const expired = await initiate("client-expired")
    const ticketHash = createHash("sha256").update(expired.body.ticket!).digest("hex")
    await db.update(legacyAccountLinkInitiations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(legacyAccountLinkInitiations.ticketHash, ticketHash))
    const fixture = await createFixture({})
    expect((await inspect(fixture.cookie, expired.body.ticket!)).status).toBe(400)
  })

  test("exchanges once, preserves state and clears the Legacy client ID", async () => {
    const fixture = await createFixture({})
    const initiated = await initiate("client-42")
    const confirmed = await confirm(fixture.cookie, initiated.body.ticket!)
    expect(confirmed.response.status).toBe(200)
    const callback = new URL(confirmed.body.callbackUrl!)
    const code = callback.searchParams.get("code")!

    const exchanged = await signedExchange({ code, legacyClientId: "client-42", redirectUri, codeVerifier: initiated.verifier })
    expect(exchanged.status).toBe(200)
    expect(await exchanged.json()).toMatchObject({ partnerId: fixture.partnerId, type: "creator", status: "active" })

    const hash = createHash("sha256").update(code).digest("hex")
    const stored = await db.select().from(legacyAccountLinkCodes).where(eq(legacyAccountLinkCodes.codeHash, hash)).limit(1)
    expect(stored[0]?.consumedAt).toBeTruthy()
    expect(stored[0]?.legacyClientId).toBeNull()

    const reused = await signedExchange({ code, legacyClientId: "client-42", redirectUri, codeVerifier: initiated.verifier })
    expect(reused.status).toBe(400)
  })

  test("rejects a wrong PKCE verifier, expired code and mismatched client", async () => {
    const fixture = await createFixture({})
    const wrongVerifier = await initiate("client-43")
    const confirmed = await confirm(fixture.cookie, wrongVerifier.body.ticket!)
    const code = new URL(confirmed.body.callbackUrl!).searchParams.get("code")!
    const wrongPkce = await signedExchange({ code, legacyClientId: "client-43", redirectUri, codeVerifier: randomBytes(32).toString("base64url") })
    expect(wrongPkce.status).toBe(400)

    const wrongClient = await signedExchange({ code, legacyClientId: "client-other", redirectUri, codeVerifier: wrongVerifier.verifier })
    expect(wrongClient.status).toBe(400)

    const expired = await initiate("client-44")
    const expiredConfirmed = await confirm(fixture.cookie, expired.body.ticket!)
    const expiredCode = new URL(expiredConfirmed.body.callbackUrl!).searchParams.get("code")!
    const expiredHash = createHash("sha256").update(expiredCode).digest("hex")
    await db.update(legacyAccountLinkCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(legacyAccountLinkCodes.codeHash, expiredHash))
    const expiredExchange = await signedExchange({ code: expiredCode, legacyClientId: "client-44", redirectUri, codeVerifier: expired.verifier })
    expect(expiredExchange.status).toBe(400)
  })

  test("does not confirm or exchange after the creator is suspended or banned", async () => {
    for (const status of ["suspended", "banned"] as const) {
      const fixture = await createFixture({})
      const initiated = await initiate(`client-${status}`)
      await db.update(partners).set({ status }).where(eq(partners.id, fixture.partnerId!))
      expect((await inspect(fixture.cookie, initiated.body.ticket!)).status).toBe(403)
    }
  })

  test("allows only one of two concurrent exchanges", async () => {
    const fixture = await createFixture({})
    const initiated = await initiate("client-concurrent")
    const confirmed = await confirm(fixture.cookie, initiated.body.ticket!)
    const code = new URL(confirmed.body.callbackUrl!).searchParams.get("code")!
    const responses = await Promise.all([
      signedExchange({ code, legacyClientId: "client-concurrent", redirectUri, codeVerifier: initiated.verifier }),
      signedExchange({ code, legacyClientId: "client-concurrent", redirectUri, codeVerifier: initiated.verifier }),
    ])
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1)
    expect(responses.filter((response) => response.status === 400)).toHaveLength(1)
  })

  test("rejects invalid HMAC, expired timestamp, replay and unknown key", async () => {
    const invalid = await signedExchange({ code: "A".repeat(43), legacyClientId: "1", redirectUri, codeVerifier: "A".repeat(43) }, { signature: "0".repeat(64) })
    expect(invalid.status).toBe(401)

    const expired = await signedExchange({ code: "A".repeat(43), legacyClientId: "1", redirectUri, codeVerifier: "A".repeat(43) }, { timestamp: Math.floor(Date.now() / 1000) - 61 })
    expect(expired.status).toBe(401)

    const nonce = randomBytes(16).toString("base64url")
    const first = await signedExchange({ code: "A".repeat(43), legacyClientId: "1", redirectUri, codeVerifier: "A".repeat(43) }, { nonce })
    const second = await signedExchange({ code: "A".repeat(43), legacyClientId: "1", redirectUri, codeVerifier: "A".repeat(43) }, { nonce })
    expect(first.status).toBe(400)
    expect(second.status).toBe(409)

    const unknown = await signedExchange({ code: "A".repeat(43), legacyClientId: "1", redirectUri, codeVerifier: "A".repeat(43) }, { requestKeyId: "legacy-to-partners-unknown" })
    expect(unknown.status).toBe(401)
  })

  test("returns only non-PII current partner status to Legacy", async () => {
    const fixture = await createFixture({ status: "banned" })
    const response = await signedLegacy("/partner-status", { partnerId: fixture.partnerId! })
    expect(response.status).toBe(200)
    const result = await response.json() as Record<string, unknown>
    expect(result).toEqual({ partnerId: fixture.partnerId, creatorId: expect.any(String), type: "creator", status: "banned" })
    expect(result).not.toHaveProperty("email")
    expect(result).not.toHaveProperty("phone")
  })
})
