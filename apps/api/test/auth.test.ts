import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { hashPassword } from "better-auth/crypto"
import { desc, eq } from "drizzle-orm"
import { Hono } from "hono"
import { auditLogs, authAccounts, authSessions, authVerifications, getDb, passwordResetDeliveries, users } from "@vizaje/db"
import { bootstrapAdmin } from "../src/cli/bootstrap-admin"
import { app } from "../src/index"
import { requirePermission, type ApiEnv, type AuthenticatedRequest } from "../src/auth/middleware"
import { hasPermission } from "../src/auth/permissions"

const db = getDb()
const fixtureEmail = `m2-fixture-${crypto.randomUUID()}@vizaje.local`
const fixturePassword = "M2-fixture-password-2026"
const fixtureIpBytes = crypto.getRandomValues(new Uint8Array(2))
const fixtureIp = `10.240.${fixtureIpBytes[0]}.${fixtureIpBytes[1]}`
let fixtureUserId = ""

function request(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set("x-forwarded-for", fixtureIp)
  return app.fetch(new Request(`http://localhost:3001${path}`, { ...init, headers }))
}

function sessionCookie(response: Response) {
  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  const cookie = setCookies.find((value) => value.startsWith("better-auth.session_token=")) ?? response.headers.get("set-cookie")
  if (!cookie) throw new Error("Expected a session cookie")
  return cookie.split(";", 1)[0]
}

async function login(password = fixturePassword) {
  const response = await request("/v1/auth/sign-in/email", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ email: fixtureEmail, password }),
  })
  const rawBody = await response.text()
  const body = (rawBody ? JSON.parse(rawBody) : {}) as { token?: string }
  return { response, body, rawBody, cookie: response.ok ? sessionCookie(response) : undefined }
}

beforeAll(async () => {
  fixtureUserId = crypto.randomUUID()
  const now = new Date()
  await db.insert(users).values({
    id: fixtureUserId,
    email: fixtureEmail,
    name: "M2 Fixture",
    emailVerified: true,
    role: "super_admin",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(authAccounts).values({
    id: crypto.randomUUID(),
    accountId: fixtureUserId,
    providerId: "credential",
    userId: fixtureUserId,
    password: await hashPassword(fixturePassword),
    createdAt: now,
    updatedAt: now,
  })
})

afterAll(async () => {
  await db.delete(passwordResetDeliveries).where(eq(passwordResetDeliveries.userId, fixtureUserId))
  await db.delete(authVerifications).where(eq(authVerifications.identifier, fixtureUserId))
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, fixtureUserId))
  await db.delete(authSessions).where(eq(authSessions.userId, fixtureUserId))
  await db.delete(authAccounts).where(eq(authAccounts.userId, fixtureUserId))
  await db.delete(users).where(eq(users.id, fixtureUserId))
})

describe("admin authentication", () => {
  test("rejects an unauthenticated protected route", async () => {
    const response = await request("/v1/admin/me")
    expect(response.status).toBe(401)
  })

  test("returns a generic invalid-credentials response", async () => {
    const { response, rawBody } = await login("wrong-password")
    expect(response.status).toBe(401)
    expect(rawBody).toContain("Invalid email or password")
  })

  test("rejects missing credentials", async () => {
    const response = await request("/v1/auth/sign-in/email", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ email: fixtureEmail }),
    })
    expect(response.status).toBe(400)
  })

  test("accepts valid credentials and enforces the server-side identity", async () => {
    const { response, cookie } = await login()
    expect(response.status).toBe(200)
    expect(response.headers.get("set-cookie")).toContain("HttpOnly")

    const adminResponse = await request("/v1/admin/me", { headers: { cookie: cookie! } })
    expect(adminResponse.status).toBe(200)
    const body = (await adminResponse.json()) as { user: { role: string } }
    expect(body.user.role).toBe("super_admin")
  })

  test("rejects an expired session", async () => {
    const { body, cookie } = await login()
    await db.update(authSessions).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(authSessions.token, body.token!))
    const response = await request("/v1/admin/me", { headers: { cookie: cookie! } })
    expect(response.status).toBe(401)
  })

  test("rejects a revoked session", async () => {
    const { body, cookie } = await login()
    await db.delete(authSessions).where(eq(authSessions.token, body.token!))
    const response = await request("/v1/admin/me", { headers: { cookie: cookie! } })
    expect(response.status).toBe(401)
  })

  test("logs logout and clears the session", async () => {
    const { cookie } = await login()
    const logout = await request("/v1/auth/sign-out", {
      method: "POST",
      headers: { origin: "http://localhost:3000", cookie: cookie!, "content-type": "application/json" },
      body: "{}",
    })
    expect(logout.status).toBe(200)
    const session = await request("/v1/auth/get-session", { headers: { cookie: cookie! } })
    expect(await session.json()).toBeNull()

    const audit = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.action, "AUTH_LOGOUT"))
    expect(audit.length).toBeGreaterThan(0)
  })

  test("uses a generic reset response and revokes sessions after a single-use reset", async () => {
    const { cookie: oldSession } = await login()
    const existing = await request("/v1/auth/request-password-reset", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ email: fixtureEmail, redirectTo: "http://localhost:3000/reset-password" }),
    })
    const unknown = await request("/v1/auth/request-password-reset", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ email: "does-not-exist@vizaje.local", redirectTo: "http://localhost:3000/reset-password" }),
    })
    expect(existing.status).toBe(200)
    expect(unknown.status).toBe(existing.status)
    expect(await existing.text()).toBe(await unknown.text())

    const verification = await db
      .select({ identifier: authVerifications.identifier })
      .from(authVerifications)
      .where(eq(authVerifications.value, fixtureUserId))
      .orderBy(desc(authVerifications.createdAt))
      .limit(1)
    const token = verification[0]?.identifier.replace(/^reset-password:/, "")
    expect(token).toBeTruthy()

    const reset = await request("/v1/auth/reset-password", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword: "P1.1-reset-password-2026" }),
    })
    expect(reset.status).toBe(200)
    expect(await (await request("/v1/auth/get-session", { headers: { cookie: oldSession! } })).json()).toBeNull()

    const reused = await request("/v1/auth/reset-password", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword: "P1.1-reset-password-2026" }),
    })
    expect(reused.status).toBe(400)

    const expiredRequest = await request("/v1/auth/request-password-reset", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ email: fixtureEmail, redirectTo: "http://localhost:3000/reset-password" }),
    })
    expect(expiredRequest.status).toBe(200)
    const expiredVerification = await db
      .select({ identifier: authVerifications.identifier })
      .from(authVerifications)
      .where(eq(authVerifications.value, fixtureUserId))
      .orderBy(desc(authVerifications.createdAt))
      .limit(1)
    const expiredIdentifier = expiredVerification[0]?.identifier
    const expiredToken = expiredIdentifier?.replace(/^reset-password:/, "")
    expect(expiredToken).toBeTruthy()
    await db.update(authVerifications).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(authVerifications.identifier, expiredIdentifier!))
    const expired = await request("/v1/auth/reset-password", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ token: expiredToken, newPassword: "P1.1-reset-password-2026" }),
    })
    expect(expired.status).toBe(400)
    expect((await login()).response.status).toBe(401)
    expect((await login("P1.1-reset-password-2026")).response.status).toBe(200)
  })
})

describe("permissions and bootstrap", () => {
  test("keeps the initial role permissions centralized", () => {
    expect(hasPermission("super_admin", "users:manage")).toBe(true)
    expect(hasPermission("analyst", "users:manage")).toBe(false)
    expect(hasPermission("finance", "agreements:write")).toBe(true)
    expect(hasPermission("finance", "finance:read")).toBe(true)
    expect(hasPermission("finance", "finance:write")).toBe(true)
    expect(hasPermission("finance", "settings:write")).toBe(false)
    expect(hasPermission("support", "agreements:write")).toBe(false)
  })

  test("rejects a request when the role lacks the required permission", async () => {
    const permissionApp = new Hono<ApiEnv>()
    permissionApp.use("*", async (c, next) => {
      c.set("auth", {
        user: { role: "analyst" } as AuthenticatedRequest["user"],
        session: {} as AuthenticatedRequest["session"],
      })
      await next()
    })
    permissionApp.use("*", requirePermission("users:manage"))
    permissionApp.get("/", (c) => c.json({ ok: true }))

    const response = await permissionApp.fetch(new Request("http://localhost/"))
    expect(response.status).toBe(403)
  })

  test("does not allow a second bootstrap admin", async () => {
    await expect(bootstrapAdmin("second@vizaje.local", "another-password-2026")).rejects.toThrow("Bootstrap already completed")
  })
})
