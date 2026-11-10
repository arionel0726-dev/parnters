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
  legacyAccountLinkNonces,
  partnerAccounts,
  partners,
  users,
} from "@vizaje/db"
import { app } from "../src/index"
import { buildAccountLinkCanonicalString } from "../src/modules/account-linking/service-auth"

const redirectUri = "https://dev.vizaje-nica.com/account-link/callback"
const keyId = "legacy-to-partners-test-2026-11"
const secret = randomBytes(32)
const secretBase64Url = secret.toString("base64url")
const password = "M5.3B.1B-account-linking-test-2026"
const createdUserIds: string[] = []
const createdPartnerIds: string[] = []
const createdCodeHashes: string[] = []

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

async function authorize(cookie: string, clientId = "12345", uri = redirectUri, confirmed = true) {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const response = await request("/v1/partner/account-linking/authorize", {
    method: "POST",
    headers: { origin: "http://localhost:3000", cookie, "content-type": "application/json" },
    body: JSON.stringify({ legacyClientId: clientId, redirectUri: uri, codeChallenge: challenge, confirmed }),
  })
  const body = await response.json() as { code?: string; expiresAt?: string }
  if (body.code) createdCodeHashes.push(createHash("sha256").update(body.code).digest("hex"))
  return { response, body, verifier }
}

function signedExchange(
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
    pathAndQuery: "/v1/internal/account-linking/exchange",
    timestamp,
    nonce,
    rawBody,
  })
  const signature = options.signature ?? createHmac("sha256", secret).update(canonical, "utf8").digest("hex")
  return request("/v1/internal/account-linking/exchange", {
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
  await db.delete(legacyAccountLinkNonces).where(eq(legacyAccountLinkNonces.keyId, keyId))
}

beforeAll(async () => {
  await db.delete(legacyAccountLinkNonces).where(eq(legacyAccountLinkNonces.keyId, keyId))
})

afterAll(cleanFixtureData)

describe("Legacy account linking", () => {
  test("requires authentication, trusted Origin, explicit confirmation and an active creator", async () => {
    const unauthenticated = await request("/v1/partner/account-linking/authorize", { method: "POST" })
    expect(unauthenticated.status).toBe(401)

    const fixture = await createFixture({})
    const missingOrigin = await request("/v1/partner/account-linking/authorize", {
      method: "POST",
      headers: { cookie: fixture.cookie, "content-type": "application/json" },
      body: JSON.stringify({ legacyClientId: "1", redirectUri, codeChallenge: randomBytes(32).toString("base64url"), confirmed: true }),
    })
    expect(missingOrigin.status).toBe(403)

    const issued = await authorize(fixture.cookie)
    expect(issued.response.status).toBe(201)
    const suspended = await authorize((await createFixture({ status: "suspended" })).cookie)
    expect(suspended.response.status).toBe(403)
    const banned = await authorize((await createFixture({ status: "banned" })).cookie)
    expect(banned.response.status).toBe(403)

    const regular = await createFixture({ withPartner: false })
    const regularResult = await authorize(regular.cookie)
    expect(regularResult.response.status).toBe(403)
  })

  test("rejects an unapproved redirect URI and invalid confirmation", async () => {
    const fixture = await createFixture({})
    const wrongRedirect = await authorize(fixture.cookie, "1", "https://evil.example/callback")
    expect(wrongRedirect.response.status).toBe(400)

    const response = await authorize(fixture.cookie, "1", redirectUri, false)
    expect(response.response.status).toBe(400)
  })

  test("exchanges once, invalidates the code and clears the Legacy client ID", async () => {
    const fixture = await createFixture({})
    const issued = await authorize(fixture.cookie, "client-42")
    expect(issued.response.status).toBe(201)
    expect(issued.body.code).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const exchanged = await signedExchange({ code: issued.body.code!, legacyClientId: "client-42", redirectUri, codeVerifier: issued.verifier })
    expect(exchanged.status).toBe(200)
    expect(await exchanged.json()).toMatchObject({ partnerId: fixture.partnerId, type: "creator", status: "active" })

    const hash = createHash("sha256").update(issued.body.code!).digest("hex")
    const stored = await db.select().from(legacyAccountLinkCodes).where(eq(legacyAccountLinkCodes.codeHash, hash)).limit(1)
    expect(stored[0]?.consumedAt).toBeTruthy()
    expect(stored[0]?.legacyClientId).toBeNull()

    const reused = await signedExchange({ code: issued.body.code!, legacyClientId: "client-42", redirectUri, codeVerifier: issued.verifier })
    expect(reused.status).toBe(400)
  })

  test("rejects a wrong PKCE verifier, expired code and mismatched client", async () => {
    const fixture = await createFixture({})
    const wrongVerifier = await authorize(fixture.cookie, "client-43")
    const wrongPkce = await signedExchange({ code: wrongVerifier.body.code!, legacyClientId: "client-43", redirectUri, codeVerifier: randomBytes(32).toString("base64url") })
    expect(wrongPkce.status).toBe(400)

    const wrongClient = await signedExchange({ code: wrongVerifier.body.code!, legacyClientId: "client-other", redirectUri, codeVerifier: wrongVerifier.verifier })
    expect(wrongClient.status).toBe(400)

    const expired = await authorize(fixture.cookie, "client-44")
    const expiredHash = createHash("sha256").update(expired.body.code!).digest("hex")
    await db.update(legacyAccountLinkCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(legacyAccountLinkCodes.codeHash, expiredHash))
    const expiredExchange = await signedExchange({ code: expired.body.code!, legacyClientId: "client-44", redirectUri, codeVerifier: expired.verifier })
    expect(expiredExchange.status).toBe(400)
  })

  test("does not exchange a code after the creator is suspended or banned", async () => {
    for (const status of ["suspended", "banned"] as const) {
      const fixture = await createFixture({})
      const issued = await authorize(fixture.cookie, `client-${status}`)
      await db.update(partners).set({ status }).where(eq(partners.id, fixture.partnerId!))

      const response = await signedExchange({
        code: issued.body.code!,
        legacyClientId: `client-${status}`,
        redirectUri,
        codeVerifier: issued.verifier,
      })
      expect(response.status).toBe(403)

      const hash = createHash("sha256").update(issued.body.code!).digest("hex")
      const stored = await db.select().from(legacyAccountLinkCodes).where(eq(legacyAccountLinkCodes.codeHash, hash)).limit(1)
      expect(stored[0]?.consumedAt).toBeTruthy()
      expect(stored[0]?.legacyClientId).toBeNull()
    }
  })

  test("allows only one of two concurrent exchanges", async () => {
    const fixture = await createFixture({})
    const issued = await authorize(fixture.cookie, "client-concurrent")
    const responses = await Promise.all([
      signedExchange({ code: issued.body.code!, legacyClientId: "client-concurrent", redirectUri, codeVerifier: issued.verifier }),
      signedExchange({ code: issued.body.code!, legacyClientId: "client-concurrent", redirectUri, codeVerifier: issued.verifier }),
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
    const body = JSON.stringify({ partnerId: fixture.partnerId })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = randomBytes(16).toString("base64url")
    const canonical = buildAccountLinkCanonicalString({ keyId, method: "POST", pathAndQuery: "/v1/internal/account-linking/partner-status", timestamp, nonce, rawBody: body })
    const signature = createHmac("sha256", secret).update(canonical).digest("hex")
    const response = await request("/v1/internal/account-linking/partner-status", { method: "POST", headers: { "content-type": "application/json", "x-vp-key-id": keyId, "x-vp-timestamp": timestamp, "x-vp-nonce": nonce, "x-vp-signature": signature }, body })
    expect(response.status).toBe(200)
    const result = await response.json() as Record<string, unknown>
    expect(result).toEqual({ partnerId: fixture.partnerId, creatorId: expect.any(String), type: "creator", status: "banned" })
    expect(result).not.toHaveProperty("email")
    expect(result).not.toHaveProperty("phone")
  })
})
