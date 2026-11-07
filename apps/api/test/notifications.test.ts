import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { hashPassword } from "better-auth/crypto"
import { eq, inArray } from "drizzle-orm"
import { authAccounts, authSessions, getDb, notifications, partnerAccounts, partners, users } from "@vizaje/db"
import { app } from "../src/index"
import { createNotifications, notifyCreatorApplicationDecision, notifyCreatorApplicationSubmitted, notifyPartnerCommissionChanged, notifyPartnerStatusChanged } from "../src/modules/notifications/service"

const db = getDb()
const ownerEmail = `notifications-owner-${crypto.randomUUID()}@vizaje.local`
const otherEmail = `notifications-other-${crypto.randomUUID()}@vizaje.local`
const password = "notifications-fixture-password-2026"
const ownerId = crypto.randomUUID()
const otherId = crypto.randomUUID()
const partnerId = crypto.randomUUID()
const notificationIds: string[] = []

function request(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set("x-forwarded-for", `10.251.${crypto.getRandomValues(new Uint8Array(1))[0]}.1`)
  return app.fetch(new Request(`http://localhost:3001${path}`, { ...init, headers }))
}

function sessionCookie(response: Response) {
  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  const cookie = setCookies.find((value) => value.startsWith("better-auth.session_token=")) ?? response.headers.get("set-cookie")
  if (!cookie) throw new Error("Expected a session cookie")
  return cookie.split(";", 1)[0]
}

async function login(email: string) {
  const response = await request("/v1/auth/sign-in/email", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  expect(response.status).toBe(200)
  return sessionCookie(response)
}

beforeAll(async () => {
  const now = new Date()
  await db.insert(users).values([
    { id: ownerId, email: ownerEmail, name: "Notification owner", emailVerified: true, role: "super_admin", isActive: true, createdAt: now, updatedAt: now },
    { id: otherId, email: otherEmail, name: "Notification other", emailVerified: true, role: "analyst", isActive: true, createdAt: now, updatedAt: now },
  ])
  await db.insert(authAccounts).values([
    { id: crypto.randomUUID(), accountId: ownerId, providerId: "credential", userId: ownerId, password: await hashPassword(password), createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), accountId: otherId, providerId: "credential", userId: otherId, password: await hashPassword(password), createdAt: now, updatedAt: now },
  ])
})

afterAll(async () => {
  await db.delete(notifications).where(inArray(notifications.recipientUserId, [ownerId, otherId]))
  await db.delete(partnerAccounts).where(eq(partnerAccounts.partnerId, partnerId))
  await db.delete(partners).where(eq(partners.id, partnerId))
  await db.delete(authSessions).where(inArray(authSessions.userId, [ownerId, otherId]))
  await db.delete(authAccounts).where(inArray(authAccounts.userId, [ownerId, otherId]))
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]))
})

describe("notification center", () => {
  test("requires authentication and does not expose a public create endpoint", async () => {
    expect((await request("/v1/notifications")).status).toBe(401)
    expect((await request("/v1/notifications", { method: "POST", body: "{}" })).status).toBe(401)
  })

  test("deduplicates event creation and paginates only the recipient's records", async () => {
    await db.transaction(async (tx) => {
      await createNotifications(tx, [ownerId], {
        eventKey: "test:notification:one",
        type: "creator_application_submitted",
        title: "Новая заявка",
        message: "Есть новая заявка.",
        metadata: { href: "/app/applications", entityId: crypto.randomUUID() },
      })
      await createNotifications(tx, [ownerId], {
        eventKey: "test:notification:one",
        type: "creator_application_submitted",
        title: "Новая заявка",
        message: "Дубликат не должен появиться.",
        metadata: { href: "/app/applications" },
      })
      await createNotifications(tx, [ownerId], {
        eventKey: "test:notification:two",
        type: "partner_status_changed",
        title: "Статус изменён",
        message: "Статус аккаунта изменён.",
        metadata: { href: "/dashboard/settings", status: "active" },
      })
      await createNotifications(tx, [ownerId], {
        eventKey: "test:notification:three",
        type: "partner_commission_changed",
        title: "Комиссия изменена",
        message: "Условия комиссии изменены.",
        metadata: { href: "/dashboard/earnings" },
      })
    })

    const ownerCookie = await login(ownerEmail)
    const firstPage = await request("/v1/notifications?page=1&pageSize=2", { headers: { cookie: ownerCookie } })
    expect(firstPage.status).toBe(200)
    const firstBody = await firstPage.json() as { notifications: Array<{ id: string }>; total: number; unreadCount: number }
    expect(firstBody.notifications).toHaveLength(2)
    expect(firstBody.total).toBe(3)
    expect(firstBody.unreadCount).toBe(3)
    notificationIds.push(...firstBody.notifications.map(({ id }) => id))

    const otherCookie = await login(otherEmail)
    const otherPage = await request("/v1/notifications", { headers: { cookie: otherCookie } })
    expect(otherPage.status).toBe(200)
    expect((await otherPage.json()).notifications).toHaveLength(0)

    const invalidPageSize = await request("/v1/notifications?pageSize=51", { headers: { cookie: ownerCookie } })
    expect(invalidPageSize.status).toBe(400)
  })

  test("enforces ownership and makes read operations idempotent", async () => {
    const ownerCookie = await login(ownerEmail)
    const otherCookie = await login(otherEmail)
    const notificationId = notificationIds[0]
    expect(notificationId).toBeTruthy()

    const forbiddenRead = await request(`/v1/notifications/${notificationId}/read`, { method: "POST", headers: { cookie: otherCookie } })
    expect(forbiddenRead.status).toBe(404)

    const firstRead = await request(`/v1/notifications/${notificationId}/read`, { method: "POST", headers: { cookie: ownerCookie } })
    expect(firstRead.status).toBe(200)
    expect(await firstRead.json()).toEqual({ marked: true, idempotent: false })

    const repeatedRead = await request(`/v1/notifications/${notificationId}/read`, { method: "POST", headers: { cookie: ownerCookie } })
    expect(repeatedRead.status).toBe(200)
    expect(await repeatedRead.json()).toEqual({ marked: true, idempotent: true })

    const unread = await request("/v1/notifications/unread-count", { headers: { cookie: ownerCookie } })
    expect(await unread.json()).toEqual({ unreadCount: 2 })

    const allRead = await request("/v1/notifications/read-all", { method: "POST", headers: { cookie: ownerCookie } })
    expect(allRead.status).toBe(200)
    expect((await allRead.json()).markedCount).toBe(2)
    const repeatedAllRead = await request("/v1/notifications/read-all", { method: "POST", headers: { cookie: ownerCookie } })
    expect((await repeatedAllRead.json()).markedCount).toBe(0)
  })

  test("creates notifications from application, status and commission events for existing recipients", async () => {
    const now = new Date()
    await db.insert(partners).values({ id: partnerId, creatorId: `CRE-NOTIFY-${partnerId.slice(0, 6)}`, displayName: "Notification partner", email: otherEmail, type: "creator", status: "active", createdAt: now, updatedAt: now })
    await db.insert(partnerAccounts).values({ userId: otherId, partnerId, createdAt: now, updatedAt: now })

    await db.transaction(async (tx) => {
      await notifyCreatorApplicationSubmitted(tx, crypto.randomUUID())
      await notifyPartnerStatusChanged(tx, partnerId, "suspended")
      await notifyPartnerCommissionChanged(tx, partnerId, crypto.randomUUID())
      await notifyCreatorApplicationDecision(tx, crypto.randomUUID(), partnerId, "approved", "ru")
    })

    const ownerEvents = await db.select().from(notifications).where(eq(notifications.recipientUserId, ownerId))
    const partnerEvents = await db.select().from(notifications).where(eq(notifications.recipientUserId, otherId))
    expect(ownerEvents.some((notification) => notification.type === "creator_application_submitted")).toBe(true)
    expect(partnerEvents.map((notification) => notification.type).sort()).toEqual([
      "creator_application_approved",
      "partner_commission_changed",
      "partner_status_changed",
    ])
  })
})
