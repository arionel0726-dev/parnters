import { randomBytes, randomUUID } from "node:crypto"

const expectedDatabaseName = "vizaje_partners_m523_test"
const apiPort = Number(process.env.M523_API_PORT ?? 39149)
const root = process.env.VZ_PARTNERS_ROOT ?? "/Users/arsen/Desktop/vz-partners"

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function toBase64Url(value: string) {
  return value.replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const databaseUrl = requireEnv("DATABASE_URL")
const database = new URL(databaseUrl)
assert(database.hostname === "127.0.0.1" && database.port === "5434", "DATABASE_URL must target local 127.0.0.1:5434")
assert(database.pathname === `/${expectedDatabaseName}`, `DATABASE_URL must target ${expectedDatabaseName}`)

const vpSecret = toBase64Url(requireEnv("VP_SECRET"))
assert(/^[A-Za-z0-9_-]{43,}$/.test(vpSecret), "VP_SECRET must be a standard Base64 secret with at least 32 bytes")

process.env.NODE_ENV = "test"
process.env.DATABASE_URL = databaseUrl
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("base64url")
process.env.BETTER_AUTH_URL = `http://127.0.0.1:${apiPort}`
process.env.AUTH_TRUSTED_ORIGINS = `http://127.0.0.1:${apiPort},http://localhost:${apiPort}`
process.env.REFERRAL_SERVICE_TOKEN = randomBytes(32).toString("hex")
process.env.REFERRAL_SHORT_URL_ORIGIN = "http://127.0.0.1:3000"
process.env.WEB_APP_URL = "http://127.0.0.1:3000"
process.env.EMAIL_FROM = "Vizaje Partners <partners@example.test>"
process.env.RESEND_API_KEY = ""
process.env.VIZAJE_DESTINATION_HOSTS = "vizaje-nica.com,www.vizaje-nica.com,ru.vizaje-nica.com,ro.vizaje-nica.com"
process.env.LEGACY_RESOLVER_ENABLED = "true"
process.env.LEGACY_INTERNAL_BASE_URL = "https://dev.vizaje-nica.com"
process.env.LEGACY_RESOLVER_HMAC_KEYS = JSON.stringify([{
  keyId: "partners-to-legacy-dev-2026-11",
  secret: vpSecret,
  active: true,
}])
process.env.REFERRAL_TRACKING_ENABLED = "false"
process.env.CREATOR_FINANCE_ENABLED = "false"
process.env.PAYOUTS_ENABLED = "false"

const [{ app }, { hashPassword }, dbModule, drizzleModule] = await Promise.all([
  import("../src/index"),
  import("better-auth/crypto"),
  import("@vizaje/db"),
  import("drizzle-orm"),
])

const { getDb, closeDatabase, authAccounts, authSessions, auditLogs, partnerAccounts, partners, referralLinkClicks, referralLinks, users } = {
  ...dbModule,
}
const { eq, inArray, sql } = drizzleModule
const db = getDb()

const userId = randomUUID()
const partnerId = randomUUID()
const email = `m523-e2e-${randomUUID()}@vizaje.local`
const password = "M523-local-test-password-2026"
const createdLinkIds: string[] = []
const createdCodes: string[] = []

function apiRequest(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://127.0.0.1:${apiPort}${path}`, init))
}

function cookieFrom(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const value = headers.getSetCookie?.().find((item) => item.startsWith("better-auth.session_token=")) ?? response.headers.get("set-cookie")
  assert(value, "login did not return a session cookie")
  return value.split(";", 1)[0]
}

async function createCreator() {
  const now = new Date()
  await db.insert(users).values({ id: userId, email, name: "M5.2.3 E2E Creator", emailVerified: true, role: "analyst", isActive: true, createdAt: now, updatedAt: now })
  await db.insert(authAccounts).values({ id: randomUUID(), accountId: userId, providerId: "credential", userId, password: await hashPassword(password), createdAt: now, updatedAt: now })
  await db.insert(partners).values({ id: partnerId, creatorId: `M523-${userId.slice(0, 8)}`, displayName: "M5.2.3 E2E Creator", email, type: "creator", status: "active", tier: "starter", createdAt: now, updatedAt: now })
  await db.insert(partnerAccounts).values({ userId, partnerId, createdAt: now, updatedAt: now })

  const response = await apiRequest("/v1/auth/sign-in/email", {
    method: "POST",
    headers: { origin: `http://127.0.0.1:${apiPort}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  assert(response.status === 200, `login failed with HTTP ${response.status}`)
  return cookieFrom(response)
}

function creatorRequest(path: string, cookie: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set("cookie", cookie)
  return apiRequest(path, { ...init, headers })
}

const cases = [
  { name: "homepage", linkType: "homepage", targetUrl: "https://vizaje-nica.com/ru/", requestedLocale: "ru", legacyId: "main" },
  { name: "brand", linkType: "brand", targetUrl: "https://vizaje-nica.com/ro/catalog/anastasia-beverly-hills", requestedLocale: "ro", legacyId: "177" },
  { name: "category", linkType: "category", targetUrl: "https://vizaje-nica.com/ru/katalog/korrektoryi-i-konsileryi", requestedLocale: "ru", legacyId: "48" },
  { name: "product", linkType: "product", targetUrl: "https://vizaje-nica.com/ru/katalog/teni/111157", requestedLocale: "ru", legacyId: "11048" },
] as const

let apiServer: ReturnType<typeof Bun.serve> | undefined
let referralGet: ((request: Request, context: { params: Promise<{ code: string }> }) => Promise<Response> | Response) | undefined

try {
  const cookie = await createCreator()
  apiServer = Bun.serve({ port: apiPort, fetch: app.fetch })
  process.env.API_INTERNAL_URL = `http://127.0.0.1:${apiPort}`
  // Keep the optional Next.js route check out of the API TypeScript graph. The
  // route is loaded from a URL at runtime after the API has been started.
  const routeModuleUrl = new URL("../../web/app/r/[code]/route.ts", import.meta.url).href
  referralGet = (await import(routeModuleUrl)).GET

  for (const item of cases) {
    const response = await creatorRequest("/v1/partner/referral-links", cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item),
    })
    assert(response.status === 201, `${item.name} creation failed with HTTP ${response.status}`)
    const body = await response.json() as { link: { id: string; code: string; linkType: string; targetPath: string; targetUrl: string } }
    createdLinkIds.push(body.link.id)
    createdCodes.push(body.link.code)
    assert(body.link.linkType === item.linkType, `${item.name} linkType was not preserved`)
    assert(body.link.targetPath === new URL(item.targetUrl).pathname, `${item.name} target path was not preserved`)

    const rows = await db.select().from(referralLinks).where(eq(referralLinks.id, body.link.id)).limit(1)
    const row = rows[0]
    assert(row, `${item.name} was not persisted`)
    assert(row.partnerId === partnerId, `${item.name} ownership mismatch`)
    assert(row.linkType === item.linkType, `${item.name} persisted type mismatch`)
    assert(row.legacyEntityId === item.legacyId, `${item.name} Legacy ID mismatch`)
    assert(row.preferredLocale === item.requestedLocale, `${item.name} preferred locale mismatch`)
    assert(row.fallbackLocale === "ru" || row.fallbackLocale === "ro", `${item.name} fallback locale missing`)
    assert(row.fallbackPath && row.targetPath === row.fallbackPath, `${item.name} fallback was not persisted as destination`)
    assert(row.resolverVersion === 1 && row.resolvedAt, `${item.name} resolver metadata missing`)
    assert(row.canonicalRuPath || row.canonicalRoPath, `${item.name} canonical paths missing`)
    assert(!createdCodes.slice(0, -1).includes(body.link.code), `${item.name} referral code is not unique`)

    const redirect = await referralGet!(new Request(`http://127.0.0.1:3000/r/${body.link.code}`), { params: Promise.resolve({ code: body.link.code }) })
    assert(redirect.status === 307, `${item.name} redirect status was ${redirect.status}`)
    assert(redirect.headers.get("location") === body.link.targetUrl, `${item.name} redirect Location mismatch`)

    const clickRows = await db.select({ count: sql<number>`count(*)::int` }).from(referralLinkClicks).where(eq(referralLinkClicks.referralLinkId, body.link.id))
    assert(Number(clickRows[0]?.count ?? 0) === 0, `${item.name} created a click while tracking was disabled`)
    console.log(JSON.stringify({ name: item.name, legacyId: row.legacyEntityId, ru: row.canonicalRuPath, ro: row.canonicalRoPath, fallback: row.fallbackPath, redirect: redirect.status, clicks: 0 }))
  }

  const mismatch = await creatorRequest("/v1/partner/referral-links", cookie, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ linkType: "category", targetUrl: cases[1].targetUrl, requestedLocale: "ro" }),
  })
  assert(mismatch.status === 409 || mismatch.status === 400, `expectedType mismatch returned HTTP ${mismatch.status}`)

  const unsafe = await creatorRequest("/v1/partner/referral-links", cookie, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ linkType: "product", targetUrl: "https://evil.example/ro/catalog/x/y", requestedLocale: "ro" }),
  })
  assert(unsafe.status === 400, `unsafe destination returned HTTP ${unsafe.status}`)

  const expiring = await creatorRequest("/v1/partner/referral-links", cookie, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ linkType: "homepage", targetUrl: "https://vizaje-nica.com/ru/", requestedLocale: "ru", expiresAt: new Date(Date.now() + 86_400_000).toISOString() }),
  })
  assert(expiring.status === 201, `expiring link creation failed with HTTP ${expiring.status}`)
  const expiringBody = await expiring.json() as { link: { id: string; code: string } }
  createdLinkIds.push(expiringBody.link.id)
  createdCodes.push(expiringBody.link.code)
  await db.update(referralLinks).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(referralLinks.id, expiringBody.link.id))
  const expiredRedirect = await referralGet!(new Request(`http://127.0.0.1:3000/r/${expiringBody.link.code}`), { params: Promise.resolve({ code: expiringBody.link.code }) })
  assert(expiredRedirect.status === 404, `expired link returned HTTP ${expiredRedirect.status}`)

  const revokedId = createdLinkIds[0]!
  const revokedCode = createdCodes[0]!
  const revoke = await creatorRequest(`/v1/partner/referral-links/${revokedId}/revoke`, cookie, { method: "PATCH" })
  assert(revoke.status === 200, `revoke failed with HTTP ${revoke.status}`)
  const revokedRedirect = await referralGet!(new Request(`http://127.0.0.1:3000/r/${revokedCode}`), { params: Promise.resolve({ code: revokedCode }) })
  assert(revokedRedirect.status === 404, `revoked link returned HTTP ${revokedRedirect.status}`)

  console.log(JSON.stringify({ negative: { expectedTypeMismatch: mismatch.status, unsafeDestination: unsafe.status, expired: expiredRedirect.status, revoked: revokedRedirect.status } }))
} finally {
  if (createdLinkIds.length) {
    await db.delete(referralLinkClicks).where(inArray(referralLinkClicks.referralLinkId, createdLinkIds))
    await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdLinkIds))
    await db.delete(referralLinks).where(inArray(referralLinks.id, createdLinkIds))
  }
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, userId))
  await db.delete(authSessions).where(eq(authSessions.userId, userId))
  await db.delete(authAccounts).where(eq(authAccounts.userId, userId))
  await db.delete(partnerAccounts).where(eq(partnerAccounts.userId, userId))
  await db.delete(partners).where(eq(partners.id, partnerId))
  await db.delete(users).where(eq(users.id, userId))
  apiServer?.stop()
  await closeDatabase()
}
