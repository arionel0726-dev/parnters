import { unlink } from "node:fs/promises"
import { hashPassword } from "better-auth/crypto"
import { inArray } from "drizzle-orm"
import {
  applicationReviews,
  auditLogs,
  authAccounts,
  authSessions,
  authVerifications,
  creatorApplications,
  emailDeliveries,
  closeDatabase,
  getDb,
  notifications,
  partnerAccounts,
  partnerAgreements,
  partnerInvitations,
  partners,
  referralLinkClicks,
  referralLinks,
  users,
} from "@vizaje/db"

const stateFile = "/private/tmp/vizaje-p1.3-state.json"
const fixture = {
  adminEmail: "e2e-admin@vizaje.local",
  creatorEmail: "e2e-creator@vizaje.local",
  creatorPassword: "E2E-creator-password-2026",
  adminPassword: "E2E-admin-password-2026",
  creatorId: "CRE-E2E001",
  creatorName: "E2E Creator",
  referralPartnerEmail: "e2e-referral@vizaje.local",
  applicationRejectEmail: "e2e-application-reject@vizaje.local",
  applicationApproveEmail: "e2e-application-approve@vizaje.local",
  linkLabel: "E2E Beauty homepage",
  linkCode: "E2ELINKTEST01",
}
const fixtureEmails = [fixture.adminEmail, fixture.creatorEmail, fixture.referralPartnerEmail, fixture.applicationRejectEmail, fixture.applicationApproveEmail]

async function removeFixtureRows() {
  const db = getDb()
  const existingUsers = await db.select({ id: users.id }).from(users).where(inArray(users.email, fixtureEmails))
  const userIds = existingUsers.map(({ id }) => id)
  const existingPartners = await db.select({ id: partners.id }).from(partners).where(inArray(partners.email, fixtureEmails))
  const partnerIds = existingPartners.map(({ id }) => id)
  const existingApplications = await db.select({ id: creatorApplications.id }).from(creatorApplications).where(inArray(creatorApplications.email, fixtureEmails))
  const applicationIds = existingApplications.map(({ id }) => id)

  if (applicationIds.length) {
    await db.delete(applicationReviews).where(inArray(applicationReviews.applicationId, applicationIds))
    await db.delete(emailDeliveries).where(inArray(emailDeliveries.applicationId, applicationIds))
    await db.delete(creatorApplications).where(inArray(creatorApplications.id, applicationIds))
  }
  if (partnerIds.length) {
    await db.delete(referralLinkClicks).where(inArray(referralLinkClicks.partnerId, partnerIds))
    await db.delete(referralLinks).where(inArray(referralLinks.partnerId, partnerIds))
    await db.delete(partnerAgreements).where(inArray(partnerAgreements.partnerId, partnerIds))
    await db.delete(partnerInvitations).where(inArray(partnerInvitations.partnerId, partnerIds))
    await db.delete(partnerAccounts).where(inArray(partnerAccounts.partnerId, partnerIds))
    await db.delete(partners).where(inArray(partners.id, partnerIds))
  }
  if (userIds.length) {
    await db.delete(notifications).where(inArray(notifications.recipientUserId, userIds))
    await db.delete(auditLogs).where(inArray(auditLogs.actorUserId, userIds))
    await db.delete(authSessions).where(inArray(authSessions.userId, userIds))
    await db.delete(authVerifications).where(inArray(authVerifications.value, userIds))
    await db.delete(authAccounts).where(inArray(authAccounts.userId, userIds))
    await db.delete(users).where(inArray(users.id, userIds))
  }
}

async function setup() {
  await removeFixtureRows()
  const db = getDb()
  const now = new Date()
  const adminId = crypto.randomUUID()
  const creatorUserId = crypto.randomUUID()
  const creatorPartnerId = crypto.randomUUID()
  const referralPartnerId = crypto.randomUUID()
  const applicationRejectId = crypto.randomUUID()
  const applicationApproveId = crypto.randomUUID()

  await db.insert(users).values([
    { id: adminId, email: fixture.adminEmail, name: "E2E Admin", emailVerified: true, role: "super_admin", isActive: true, createdAt: now, updatedAt: now },
    { id: creatorUserId, email: fixture.creatorEmail, name: fixture.creatorName, emailVerified: true, role: "analyst", isActive: true, createdAt: now, updatedAt: now },
  ])
  await db.insert(authAccounts).values([
    { id: crypto.randomUUID(), accountId: adminId, providerId: "credential", userId: adminId, password: await hashPassword(fixture.adminPassword), createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), accountId: creatorUserId, providerId: "credential", userId: creatorUserId, password: await hashPassword(fixture.creatorPassword), createdAt: now, updatedAt: now },
  ])
  await db.insert(partners).values([
    { id: creatorPartnerId, creatorId: fixture.creatorId, displayName: fixture.creatorName, email: fixture.creatorEmail, phone: "+37368000001", type: "creator", tier: "starter", status: "active", introduction: "Deterministic E2E creator fixture.", createdAt: now, updatedAt: now },
    { id: referralPartnerId, displayName: "E2E Referral Partner", email: fixture.referralPartnerEmail, phone: "+37368000002", type: "referral", tier: "growth", status: "active", introduction: "Deterministic E2E partner fixture.", createdAt: now, updatedAt: now },
  ])
  await db.insert(partnerAccounts).values({ userId: creatorUserId, partnerId: creatorPartnerId, createdAt: now, updatedAt: now })
  await db.insert(partnerAgreements).values({ partnerId: creatorPartnerId, createdByUserId: adminId, commissionRate: "10.00", startsAt: now.toISOString().slice(0, 10), status: "active", reason: "E2E fixture agreement", createdAt: now, updatedAt: now })
  await db.insert(creatorApplications).values([
    { id: applicationRejectId, fullName: "E2E Reject Applicant", email: fixture.applicationRejectEmail, phone: "+37368000003", dateOfBirth: "1996-04-12", audienceSize: "under_1000", partnershipFormat: "both", instagram: "https://instagram.com/e2e.reject", introduction: "E2E reject application.", consentAt: now, locale: "ru", status: "pending", createdAt: now, updatedAt: now },
    { id: applicationApproveId, fullName: "E2E Approve Applicant", email: fixture.applicationApproveEmail, phone: "+37368000004", dateOfBirth: "1997-05-13", audienceSize: "1000_5000", partnershipFormat: "ugc_creator", instagram: "https://instagram.com/e2e.approve", introduction: "E2E approve application.", consentAt: now, locale: "ru", status: "pending", createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), fullName: fixture.creatorName, email: fixture.creatorEmail, phone: "+37368000001", dateOfBirth: "1995-03-11", audienceSize: "under_1000", partnershipFormat: "both", introduction: "Approved E2E creator application.", consentAt: now, locale: "ru", status: "approved", partnerId: creatorPartnerId, createdAt: now, updatedAt: now },
  ])
  await db.insert(referralLinks).values({
    id: crypto.randomUUID(), partnerId: creatorPartnerId, code: fixture.linkCode, label: fixture.linkLabel,
    targetProtocol: "https", targetHost: "vizaje-nica.com", targetPath: "/ru/", linkType: "homepage",
    preferredLocale: "ru", fallbackLocale: "ro", fallbackPath: "/ro/", canonicalRuPath: "/ru/", canonicalRoPath: "/ro/",
    resolverVersion: 1, resolvedAt: now, status: "active", createdAt: now, updatedAt: now,
  })

  const notificationRows = [adminId, creatorUserId].flatMap((recipientUserId) => Array.from({ length: 25 }, (_, index) => ({
    recipientUserId, eventKey: `e2e:p1.3:${recipientUserId}:${index}`, type: "partner_status_changed" as const,
    title: `E2E notification ${index + 1}`, message: "Тестовое уведомление для браузерной проверки.",
    metadata: { href: recipientUserId === adminId ? "/app" : "/dashboard" }, createdAt: new Date(now.getTime() + index * 1000),
  })))
  const notificationIds = (await db.insert(notifications).values(notificationRows).returning({ id: notifications.id })).map(({ id }) => id)
  await Bun.write(stateFile, JSON.stringify({ adminId, creatorUserId, creatorPartnerId, referralPartnerId, applicationRejectId, applicationApproveId, notificationIds }))
}

async function teardown() {
  const state = await Bun.file(stateFile).json().catch(() => null) as { adminId?: string; creatorUserId?: string; creatorPartnerId?: string; referralPartnerId?: string; applicationRejectId?: string; applicationApproveId?: string; notificationIds?: string[] } | null
  if (!state) return
  const db = getDb()
  const userIds = [state.adminId, state.creatorUserId].filter((value): value is string => Boolean(value))
  const partnerIds = [state.creatorPartnerId, state.referralPartnerId].filter((value): value is string => Boolean(value))
  const applicationIds = [state.applicationRejectId, state.applicationApproveId].filter((value): value is string => Boolean(value))
  if (state.notificationIds?.length) await db.delete(notifications).where(inArray(notifications.id, state.notificationIds))
  if (applicationIds.length) {
    await db.delete(applicationReviews).where(inArray(applicationReviews.applicationId, applicationIds))
    await db.delete(emailDeliveries).where(inArray(emailDeliveries.applicationId, applicationIds))
    await db.delete(creatorApplications).where(inArray(creatorApplications.id, applicationIds))
  }
  if (partnerIds.length) {
    await db.delete(referralLinkClicks).where(inArray(referralLinkClicks.partnerId, partnerIds))
    await db.delete(referralLinks).where(inArray(referralLinks.partnerId, partnerIds))
    await db.delete(partnerAgreements).where(inArray(partnerAgreements.partnerId, partnerIds))
    await db.delete(partnerInvitations).where(inArray(partnerInvitations.partnerId, partnerIds))
    await db.delete(partnerAccounts).where(inArray(partnerAccounts.partnerId, partnerIds))
    await db.delete(partners).where(inArray(partners.id, partnerIds))
  }
  if (userIds.length) {
    await db.delete(notifications).where(inArray(notifications.recipientUserId, userIds))
    await db.delete(auditLogs).where(inArray(auditLogs.actorUserId, userIds))
    await db.delete(authSessions).where(inArray(authSessions.userId, userIds))
    await db.delete(authVerifications).where(inArray(authVerifications.value, userIds))
    await db.delete(authAccounts).where(inArray(authAccounts.userId, userIds))
    await db.delete(users).where(inArray(users.id, userIds))
  }
  await unlink(stateFile).catch(() => undefined)
}

const command = process.argv[2]
if (command === "setup") await setup()
else if (command === "teardown") await teardown()
else throw new Error("Usage: e2e-fixture.ts <setup|teardown>")
await closeDatabase()
