import { and, eq, gte, lte, lt, or, sql } from "drizzle-orm"
import { getDb, passwordResetDeliveries } from "@vizaje/db"
import { getApiEnv } from "../../env"
import { logger } from "../../logger"
import {
  decryptEmailContent,
  EMAIL_IDEMPOTENCY_WINDOW_MS,
  encryptEmailContent,
  hasAmbiguousDeliveryOutcome,
  type EmailContent,
} from "../applications/email-delivery"

const MAX_ATTEMPTS = 8
const STALE_SENDING_MS = 10 * 60 * 1000

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!)
}

function retryDelayMs(attemptCount: number) {
  return Math.min(60 * 1000 * 2 ** Math.max(0, attemptCount - 1), 6 * 60 * 60 * 1000)
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), (part) => part.toString(16).padStart(2, "0")).join("")
}

function passwordResetEmailContent(url: string): EmailContent {
  const env = getApiEnv()
  const safeUrl = escapeHtml(url)
  const subject = "Сброс пароля — Vizaje Partners"
  const text = `Здравствуйте!\n\nЧтобы сбросить пароль Vizaje Partners, откройте ссылку:\n${url}\n\nСсылка одноразовая и действует ограниченное время. Если вы не запрашивали сброс пароля, проигнорируйте это письмо.`
  const html = `<!doctype html><html><body style="margin:0;background:#fff;color:#1d1d1d;font:16px/1.6 Inter,Arial,sans-serif"><main style="max-width:560px;margin:0 auto;padding:40px 24px"><div style="margin:0 0 28px;text-align:center"><img src="${escapeHtml(new URL("/brand/mini-logo.svg", env.WEB_APP_URL).toString())}" width="36" height="27" alt="Vizaje Partners" style="display:block;width:36px;height:27px;margin:0 auto;border:0"></div><h1 style="margin:0 0 18px;font-size:26px;font-weight:500;line-height:1.2">Сброс пароля</h1><p>Здравствуйте!</p><p>Используйте кнопку ниже, чтобы задать новый пароль Vizaje Partners. Ссылка одноразовая и действует ограниченное время.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;border-radius:999px;padding:14px 24px">Задать новый пароль</a></p><p style="color:#777;font-size:14px">Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</p></main></body></html>`
  return { subject, html, text, sender: env.EMAIL_FROM }
}

export async function queuePasswordResetEmail({ userId, email, url }: { userId: string; email: string; url: string }) {
  const eventKey = `password-reset:${userId}:${await digest(url)}`
  const encryptedPayload = await encryptEmailContent(passwordResetEmailContent(url))
  const now = new Date()
  await getDb().insert(passwordResetDeliveries).values({
    userId,
    eventKey,
    recipientEmail: email,
    encryptedPayload,
    status: "queued",
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing({ target: passwordResetDeliveries.eventKey })
}

async function recordFailure(id: string, attemptCount: number, message: string, retryable: boolean) {
  const now = new Date()
  const terminal = !retryable || attemptCount >= MAX_ATTEMPTS
  await getDb().update(passwordResetDeliveries).set({
    status: terminal ? "failed" : "queued",
    lastError: message,
    nextAttemptAt: terminal ? now : new Date(now.getTime() + retryDelayMs(attemptCount)),
    updatedAt: now,
  }).where(and(eq(passwordResetDeliveries.id, id), eq(passwordResetDeliveries.status, "sending")))
}

async function claimPasswordResetDelivery(id: string) {
  const db = getDb()
  const now = new Date()
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS)
  const claimable = or(
    and(eq(passwordResetDeliveries.status, "queued"), lte(passwordResetDeliveries.nextAttemptAt, now), lt(passwordResetDeliveries.attemptCount, MAX_ATTEMPTS)),
    and(eq(passwordResetDeliveries.status, "sending"), lte(passwordResetDeliveries.lastAttemptAt, staleBefore), lt(passwordResetDeliveries.attemptCount, MAX_ATTEMPTS)),
  )!
  const rows = await db.update(passwordResetDeliveries).set({
    status: "sending",
    attemptCount: sql`${passwordResetDeliveries.attemptCount} + 1`,
    lastAttemptAt: now,
    updatedAt: now,
  }).where(and(eq(passwordResetDeliveries.id, id), claimable)).returning()
  return rows[0]
}

async function processPasswordResetDelivery(id: string) {
  const claimed = await claimPasswordResetDelivery(id)
  if (!claimed) return
  const env = getApiEnv()
  try {
    if (!env.RESEND_API_KEY) {
      await recordFailure(id, claimed.attemptCount, "Email provider is not configured.", false)
      return
    }
    if (
      claimed.firstProviderAttemptAt
      && Date.now() - claimed.firstProviderAttemptAt.getTime() >= EMAIL_IDEMPOTENCY_WINDOW_MS
      && (claimed.attemptCount > 1 || hasAmbiguousDeliveryOutcome(claimed.lastError))
    ) {
      await recordFailure(id, claimed.attemptCount, "Email delivery requires provider reconciliation.", false)
      logger.warn({ deliveryId: id, attemptCount: claimed.attemptCount }, "password reset email requires provider reconciliation")
      return
    }
    const content = await decryptEmailContent(claimed.encryptedPayload)
    await getDb().update(passwordResetDeliveries).set({
      firstProviderAttemptAt: sql`coalesce(${passwordResetDeliveries.firstProviderAttemptAt}, now())`,
      updatedAt: new Date(),
    }).where(and(eq(passwordResetDeliveries.id, id), eq(passwordResetDeliveries.status, "sending")))
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "Idempotency-Key": claimed.eventKey,
      },
      body: JSON.stringify({ from: content.sender ?? env.EMAIL_FROM, to: [claimed.recipientEmail], subject: content.subject, html: content.html, text: content.text }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500
      await recordFailure(id, claimed.attemptCount, `Email provider returned HTTP ${response.status}.`, retryable)
      return
    }
    const providerResult = await response.json().catch(() => null) as { id?: unknown } | null
    await getDb().update(passwordResetDeliveries).set({
      status: "sent",
      sentAt: new Date(),
      providerMessageId: typeof providerResult?.id === "string" ? providerResult.id : null,
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(passwordResetDeliveries.id, id))
  } catch (error) {
    const message = error instanceof DOMException && error.name === "TimeoutError"
      ? "Email provider request timed out."
      : "Email provider request failed."
    try {
      await recordFailure(id, claimed.attemptCount, message, true)
    } catch (recordError) {
      logger.error({ deliveryId: id, errorName: recordError instanceof Error ? recordError.name : "UnknownError" }, "password reset email failure could not be recorded")
    }
    logger.warn({ deliveryId: id, attemptCount: claimed.attemptCount }, "password reset email attempt failed")
  }
}

export async function dispatchDuePasswordResetEmails(limit = 30) {
  const now = new Date()
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS)
  await getDb().update(passwordResetDeliveries).set({
    status: "failed",
    lastError: "Delivery attempt limit reached after an interrupted attempt.",
    updatedAt: now,
  }).where(and(
    eq(passwordResetDeliveries.status, "sending"),
    lte(passwordResetDeliveries.lastAttemptAt, staleBefore),
    gte(passwordResetDeliveries.attemptCount, MAX_ATTEMPTS),
  ))
  const due = await getDb().select({ id: passwordResetDeliveries.id }).from(passwordResetDeliveries).where(or(
    and(eq(passwordResetDeliveries.status, "queued"), lte(passwordResetDeliveries.nextAttemptAt, now), lt(passwordResetDeliveries.attemptCount, MAX_ATTEMPTS)),
    and(eq(passwordResetDeliveries.status, "sending"), lte(passwordResetDeliveries.lastAttemptAt, staleBefore), lt(passwordResetDeliveries.attemptCount, MAX_ATTEMPTS)),
  )).limit(limit)
  await Promise.allSettled(due.map(({ id }) => processPasswordResetDelivery(id)))
}
