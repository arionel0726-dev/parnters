import { hashPassword } from "better-auth/crypto"
import { and, eq, isNull, sql } from "drizzle-orm"
import {
  applicationReviews,
  auditLogs,
  authAccounts,
  creatorApplications,
  emailDeliveries,
  getDb,
  partnerAccounts,
  partnerInvitations,
  partners,
  users,
} from "@vizaje/db"
import type { CreatorApplicationInput } from "@vizaje/contracts"
import { logger } from "../../logger"
import { consumeRateLimit } from "../../http/rate-limit"
import {
  createApplicationEmailContent,
  deriveActivationToken,
  EMAIL_IDEMPOTENCY_WINDOW_MS,
  EMAIL_RECONCILIATION_REQUIRED,
  encryptEmailContent,
  hasAmbiguousDeliveryOutcome,
  processEmailDelivery,
  type ApplicationEmailEvent,
} from "./email-delivery"
import { notifyCreatorApplicationDecision, notifyCreatorApplicationSubmitted } from "../notifications/service"

export class ApplicationConflictError extends Error {}
export class CreatorActivationError extends Error {}

const ACTIVATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

async function createInvitationSecret() {
  const id = crypto.randomUUID()
  const token = await deriveActivationToken(id)
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  const tokenHash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")
  return { id, tokenHash }
}

function eventKey(applicationId: string, event: ApplicationEmailEvent) {
  return `creator-application:${applicationId}:${event}`
}

function attemptDeliveryAfterCommit(deliveryId: string | undefined) {
  if (!deliveryId) return
  queueMicrotask(() => {
    void processEmailDelivery(deliveryId).catch((error) => {
      logger.error({ deliveryId, errorName: error instanceof Error ? error.name : "UnknownError" }, "email delivery attempt failed after state transition")
    })
  })
}

export async function consumeApplicationRateLimit(key: string) {
  const result = await consumeRateLimit(`application:${key}`, 5, 15 * 60 * 1000)
  return result.allowed
}

export async function createCreatorApplication(input: CreatorApplicationInput, _ipAddress: string | null) {
  const now = new Date()
  try {
    const result = await getDb().transaction(async (tx) => {
      const applicationRows = await tx.insert(creatorApplications).values({
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        dateOfBirth: input.dateOfBirth,
        audienceSize: input.audienceSize,
        partnershipFormat: input.partnershipFormat,
        instagram: input.instagram,
        tiktok: input.tiktok,
        otherSocial: input.otherSocial,
        contentDescription: input.contentDescription,
        partnershipReason: input.partnershipReason,
        introduction: `${input.contentDescription}\n\n${input.partnershipReason}`,
        consentAt: now,
        locale: input.locale,
        createdAt: now,
        updatedAt: now,
      }).returning()
      const application = applicationRows[0]
      if (!application) throw new Error("Application creation failed")

      const encryptedPayload = await encryptEmailContent(createApplicationEmailContent({
        event: "submitted",
        locale: application.locale,
        fullName: application.fullName,
      }))
      const deliveryRows = await tx.insert(emailDeliveries).values({
        applicationId: application.id,
        eventKey: eventKey(application.id, "submitted"),
        eventType: "submitted",
        recipientEmail: application.email,
        encryptedPayload,
        status: "queued",
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      }).returning({ id: emailDeliveries.id })
      await notifyCreatorApplicationSubmitted(tx, application.id)

      return { application, deliveryId: deliveryRows[0]?.id }
    })
    attemptDeliveryAfterCommit(result.deliveryId)
    return result.application
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string }; message?: string }
    if (databaseError.code === "23505" || databaseError.cause?.code === "23505" || databaseError.message?.includes("creator_applications_active_")) {
      throw new ApplicationConflictError("A pending or approved application already exists for these details.")
    }
    throw error
  }
}

export async function startCreatorApplicationReview(applicationId: string, reviewerUserId: string) {
  const result = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${applicationId}))`)
    const rows = await tx.select().from(creatorApplications).where(eq(creatorApplications.id, applicationId)).limit(1)
    const application = rows[0]
    if (!application) return { kind: "not_found" as const }
    if (application.status !== "pending") return { kind: "not_pending" as const }
    if (application.reviewStartedAt) return { kind: "already_started" as const }

    const now = new Date()
    await tx.update(creatorApplications)
      .set({ reviewStartedAt: now, updatedAt: now })
      .where(and(eq(creatorApplications.id, applicationId), isNull(creatorApplications.reviewStartedAt)))
    const encryptedPayload = await encryptEmailContent(createApplicationEmailContent({
      event: "in_review",
      locale: application.locale,
      fullName: application.fullName,
    }))
    const deliveryRows = await tx.insert(emailDeliveries).values({
      applicationId,
      eventKey: eventKey(applicationId, "in_review"),
      eventType: "in_review",
      recipientEmail: application.email,
      encryptedPayload,
      status: "queued",
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: emailDeliveries.id })
    await tx.insert(auditLogs).values({
      actorUserId: reviewerUserId,
      action: "CREATOR_APPLICATION_REVIEW_STARTED",
      entityType: "creator_application",
      entityId: applicationId,
      metadata: {},
      createdAt: now,
    })
    return { kind: "started" as const, deliveryId: deliveryRows[0]?.id }
  })
  if (result.kind === "started") attemptDeliveryAfterCommit(result.deliveryId)
  return result
}

export async function approveCreatorApplication(applicationId: string, reviewerUserId: string) {
  const result = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${applicationId}))`)
    const rows = await tx.select().from(creatorApplications).where(eq(creatorApplications.id, applicationId)).limit(1)
    const application = rows[0]
    if (!application) return { kind: "not_found" as const }
    if (application.status === "approved") return { kind: "already_approved" as const, application }
    if (application.status === "rejected") return { kind: "conflict" as const, message: "Rejected applications cannot be approved." }

    const sequenceRows = await tx.execute(sql`select nextval('creator_id_seq') as value`)
    const nextValue = Number((sequenceRows[0] as { value?: string | number } | undefined)?.value)
    if (!Number.isFinite(nextValue)) throw new Error("Creator ID sequence unavailable")
    const creatorId = `CRE-${String(nextValue).padStart(6, "0")}`
    const now = new Date()
    const partnerRows = await tx.insert(partners).values({
      creatorId,
      displayName: application.fullName,
      email: application.email,
      phone: application.phone,
      dateOfBirth: application.dateOfBirth,
      instagram: application.instagram,
      tiktok: application.tiktok,
      otherSocial: application.otherSocial,
      introduction: application.introduction,
      type: "creator",
      status: "active",
      createdAt: now,
      updatedAt: now,
    }).returning()
    const partner = partnerRows[0]
    if (!partner) throw new Error("Partner creation failed")

    const invitationSecret = await createInvitationSecret()
    const invitationRows = await tx.insert(partnerInvitations).values({
      id: invitationSecret.id,
      partnerId: partner.id,
      createdByUserId: reviewerUserId,
      tokenHash: invitationSecret.tokenHash,
      status: "pending",
      expiresAt: new Date(now.getTime() + ACTIVATION_LIFETIME_MS),
      createdAt: now,
      updatedAt: now,
    }).returning({ id: partnerInvitations.id })
    const invitation = invitationRows[0]
    if (!invitation) throw new Error("Partner invitation preparation failed")

    await tx.update(creatorApplications)
      .set({ status: "approved", partnerId: partner.id, updatedAt: now })
      .where(eq(creatorApplications.id, applicationId))
    await tx.insert(applicationReviews).values({ applicationId, reviewerUserId, action: "approved", createdAt: now })
    const encryptedPayload = await encryptEmailContent(createApplicationEmailContent({
      event: "approved",
      locale: application.locale,
      fullName: application.fullName,
      activationInvitationId: invitation.id,
    }))
    const deliveryRows = await tx.insert(emailDeliveries).values({
      applicationId,
      eventKey: eventKey(applicationId, "approved"),
      eventType: "approved",
      recipientEmail: application.email,
      encryptedPayload,
      status: "queued",
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: emailDeliveries.id })
    await tx.insert(auditLogs).values({
      actorUserId: reviewerUserId,
      action: "CREATOR_APPLICATION_APPROVED",
      entityType: "creator_application",
      entityId: applicationId,
      metadata: { partnerId: partner.id, creatorId, invitationId: invitation.id, invitationDelivery: "queued" },
      createdAt: now,
    })
    await notifyCreatorApplicationDecision(tx, applicationId, partner.id, "approved", application.locale)

    return {
      kind: "approved" as const,
      application: { ...application, status: "approved" as const, partnerId: partner.id },
      partner,
      deliveryId: deliveryRows[0]?.id,
    }
  })
  if (result.kind === "approved") attemptDeliveryAfterCommit(result.deliveryId)
  return result
}

export async function rejectCreatorApplication(applicationId: string, reviewerUserId: string, reason: string) {
  const result = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${applicationId}))`)
    const rows = await tx.select().from(creatorApplications).where(eq(creatorApplications.id, applicationId)).limit(1)
    const application = rows[0]
    if (!application) return { kind: "not_found" as const }
    if (application.status === "rejected") return { kind: "already_rejected" as const, application }
    if (application.status === "approved") return { kind: "conflict" as const, message: "Approved applications cannot be rejected." }

    const now = new Date()
    await tx.update(creatorApplications).set({ status: "rejected", updatedAt: now }).where(eq(creatorApplications.id, applicationId))
    await tx.insert(applicationReviews).values({ applicationId, reviewerUserId, action: "rejected", reason, createdAt: now })
    const encryptedPayload = await encryptEmailContent(createApplicationEmailContent({
      event: "rejected",
      locale: application.locale,
      fullName: application.fullName,
      rejectionReason: reason,
    }))
    const deliveryRows = await tx.insert(emailDeliveries).values({
      applicationId,
      eventKey: eventKey(applicationId, "rejected"),
      eventType: "rejected",
      recipientEmail: application.email,
      encryptedPayload,
      status: "queued",
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: emailDeliveries.id })
    await tx.insert(auditLogs).values({
      actorUserId: reviewerUserId,
      action: "CREATOR_APPLICATION_REJECTED",
      entityType: "creator_application",
      entityId: applicationId,
      metadata: { reason },
      createdAt: now,
    })
    await notifyCreatorApplicationDecision(tx, applicationId, application.partnerId, "rejected", application.locale)

    return { kind: "rejected" as const, application: { ...application, status: "rejected" as const }, deliveryId: deliveryRows[0]?.id }
  })
  if (result.kind === "rejected") attemptDeliveryAfterCommit(result.deliveryId)
  return result
}

function hashActivationToken(token: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)).then((digest) =>
    Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(""),
  )
}

export async function activateCreatorAccount(token: string, password: string) {
  const tokenHash = await hashActivationToken(token)
  const db = getDb()
  const invitationRows = await db.select({
    invitation: partnerInvitations,
    partner: partners,
    applicationId: creatorApplications.id,
    applicationStatus: creatorApplications.status,
  }).from(partnerInvitations)
    .innerJoin(partners, eq(partnerInvitations.partnerId, partners.id))
    .innerJoin(creatorApplications, eq(creatorApplications.partnerId, partners.id))
    .where(and(eq(partnerInvitations.tokenHash, tokenHash), eq(partnerInvitations.status, "pending")))
    .limit(1)
  const initial = invitationRows[0]
  if (!initial || initial.invitation.expiresAt <= new Date() || initial.partner.type !== "creator" || initial.partner.status !== "active" || initial.applicationStatus !== "approved") {
    throw new CreatorActivationError("Activation link is invalid or expired.")
  }

  const passwordHash = await hashPassword(password)
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tokenHash}))`)
    const currentRows = await tx.select({
      invitation: partnerInvitations,
      partner: partners,
      applicationStatus: creatorApplications.status,
    }).from(partnerInvitations)
      .innerJoin(partners, eq(partnerInvitations.partnerId, partners.id))
      .innerJoin(creatorApplications, eq(creatorApplications.partnerId, partners.id))
      .where(and(eq(partnerInvitations.tokenHash, tokenHash), eq(partnerInvitations.status, "pending")))
      .limit(1)
    const current = currentRows[0]
    const now = new Date()
    if (!current || current.invitation.expiresAt <= now || current.partner.type !== "creator" || current.partner.status !== "active" || current.applicationStatus !== "approved") {
      return false
    }

    const existingAccount = await tx.select({ userId: partnerAccounts.userId })
      .from(partnerAccounts).where(eq(partnerAccounts.partnerId, current.partner.id)).limit(1)
    if (existingAccount[0]) return false
    const emailRows = await tx.select({ id: users.id }).from(users).where(eq(users.email, current.partner.email ?? "")).limit(1)
    if (emailRows[0]) return false

    const userId = crypto.randomUUID()
    await tx.insert(users).values({
      id: userId,
      email: current.partner.email!,
      name: current.partner.displayName,
      emailVerified: true,
      // Creator accounts share the administrator user table for Better Auth.
      // `requireAdminAccess` rejects linked creator accounts before any admin
      // permission is evaluated, including legacy rows with this role value.
      role: "analyst",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    await tx.insert(authAccounts).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    await tx.insert(partnerAccounts).values({ userId, partnerId: current.partner.id, createdAt: now, updatedAt: now })
    await tx.update(partnerInvitations).set({ status: "accepted", acceptedAt: now, updatedAt: now }).where(eq(partnerInvitations.id, current.invitation.id))
    await tx.update(partnerInvitations).set({ status: "revoked", updatedAt: now }).where(and(
      eq(partnerInvitations.partnerId, current.partner.id),
      eq(partnerInvitations.status, "pending"),
    ))
    await tx.insert(auditLogs).values({
      actorUserId: userId,
      action: "CREATOR_ACCOUNT_ACTIVATED",
      entityType: "partner",
      entityId: current.partner.id,
      metadata: { applicationId: initial.applicationId },
      createdAt: now,
    })
    return true
  })
  if (!result) throw new CreatorActivationError("Activation link is invalid or expired.")
}

export async function retryApplicationEmailDelivery(applicationId: string, deliveryId: string) {
  const result = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${deliveryId}))`)
    const deliveryRows = await tx.select().from(emailDeliveries).where(and(
      eq(emailDeliveries.id, deliveryId),
      eq(emailDeliveries.applicationId, applicationId),
    )).limit(1)
    const delivery = deliveryRows[0]
    if (!delivery) return { kind: "not_found" as const }
    if (delivery.status !== "failed") return { kind: "not_retryable" as const }

    if (
      delivery.lastError === EMAIL_RECONCILIATION_REQUIRED
      || (
        hasAmbiguousDeliveryOutcome(delivery.lastError)
        && delivery.firstProviderAttemptAt
        && Date.now() - delivery.firstProviderAttemptAt.getTime() >= EMAIL_IDEMPOTENCY_WINDOW_MS
      )
    ) {
      return { kind: "idempotency_window_elapsed" as const }
    }

    const encryptedPayload = delivery.encryptedPayload
    if (delivery.eventType === "approved") {
      const applicationRows = await tx.select().from(creatorApplications).where(eq(creatorApplications.id, applicationId)).limit(1)
      const application = applicationRows[0]
      if (!application || application.status !== "approved" || !application.partnerId) return { kind: "not_retryable" as const }
      const accountRows = await tx.select({ userId: partnerAccounts.userId, isActive: users.isActive, password: authAccounts.password })
        .from(partnerAccounts)
        .innerJoin(users, eq(partnerAccounts.userId, users.id))
        .leftJoin(authAccounts, and(eq(authAccounts.userId, users.id), eq(authAccounts.providerId, "credential")))
        .where(eq(partnerAccounts.partnerId, application.partnerId))
        .limit(1)
      if (accountRows[0]?.isActive && accountRows[0].password) return { kind: "account_active" as const }

      const now = new Date()
      const invitationRows = await tx.select().from(partnerInvitations).where(and(
        eq(partnerInvitations.partnerId, application.partnerId),
        eq(partnerInvitations.status, "pending"),
      )).limit(1)
      const activeInvitation = invitationRows[0]
      if (!activeInvitation) return { kind: "not_retryable" as const }
      if (activeInvitation.expiresAt <= now) {
        // Keep the original link and email payload so provider idempotency remains stable on retries.
        await tx.update(partnerInvitations).set({
          expiresAt: new Date(now.getTime() + ACTIVATION_LIFETIME_MS),
          updatedAt: now,
        }).where(and(
          eq(partnerInvitations.id, activeInvitation.id),
          eq(partnerInvitations.status, "pending"),
        ))
      }
    }

    const now = new Date()
    await tx.update(emailDeliveries).set({
      status: "queued",
      attemptCount: 0,
      nextAttemptAt: now,
      lastAttemptAt: null,
      sentAt: null,
      providerMessageId: null,
      lastError: null,
      encryptedPayload,
      updatedAt: now,
    }).where(and(eq(emailDeliveries.id, deliveryId), eq(emailDeliveries.status, "failed")))
    return { kind: "queued" as const }
  })

  if (result.kind === "queued") attemptDeliveryAfterCommit(deliveryId)
  return result
}
