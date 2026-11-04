import { and, eq, gte, lte, lt, or, sql } from "drizzle-orm"
import { emailDeliveries, getDb } from "@vizaje/db"
import { getApiEnv } from "../../env"
import { logger } from "../../logger"

export type ApplicationEmailEvent = "submitted" | "in_review" | "approved" | "rejected"
type EmailContent = {
  subject: string
  html: string
  text: string
  sender?: string
  webAppUrl?: string
  activationInvitationId?: string
}

const MAX_ATTEMPTS = 8
const STALE_SENDING_MS = 10 * 60 * 1000
export const EMAIL_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000
export const EMAIL_RECONCILIATION_REQUIRED = "Email delivery outcome is uncertain; the safe retry window elapsed and manual reconciliation is required."

export function hasAmbiguousDeliveryOutcome(message: string | null) {
  return message === "Email provider request timed out."
    || message === "Email provider request failed."
    || /^Email provider returned HTTP 5\d\d\./.test(message ?? "")
    || message === "Delivery attempt limit reached after an interrupted attempt."
    || message === EMAIL_RECONCILIATION_REQUIRED
}

function base64Encode(value: Uint8Array) {
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64Decode(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

async function encryptionKey() {
  const secret = getApiEnv().BETTER_AUTH_SECRET
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`vizaje-email-outbox-v1:${secret}`))
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

export async function deriveActivationToken(invitationId: string) {
  const secret = getApiEnv().BETTER_AUTH_SECRET
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`vizaje-creator-activation-v1:${invitationId}`))
  return Array.from(new Uint8Array(signature), (value) => value.toString(16).padStart(2, "0")).join("")
}

async function activationUrl(invitationId: string, webAppUrl: string) {
  const url = new URL("/activate", webAppUrl)
  url.searchParams.set("token", await deriveActivationToken(invitationId))
  return url.toString()
}

export async function encryptEmailContent(content: EmailContent) {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await encryptionKey(),
    new TextEncoder().encode(JSON.stringify(content)),
  )
  const result = new Uint8Array(nonce.length + encrypted.byteLength)
  result.set(nonce)
  result.set(new Uint8Array(encrypted), nonce.length)
  return base64Encode(result)
}

async function decryptEmailContent(payload: string): Promise<EmailContent> {
  const decoded = base64Decode(payload)
  const nonce = decoded.slice(0, 12)
  const encrypted = decoded.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await encryptionKey(), encrypted)
  return JSON.parse(new TextDecoder().decode(decrypted)) as EmailContent
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!)
}

function cleanCandidateReason(reason: string) {
  return reason.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, 1000)
}

function emailFrame(title: string, body: string, button?: { label: string; href: string }) {
  const action = button
    ? `<p style="margin:28px 0"><a href="${escapeHtml(button.href)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;border-radius:999px;padding:14px 24px">${escapeHtml(button.label)}</a></p>`
    : ""
  const html = `<!doctype html><html><body style="margin:0;background:#fff;color:#1d1d1d;font:16px/1.6 Inter,Arial,sans-serif"><main style="max-width:560px;margin:0 auto;padding:40px 24px"><p style="margin:0 0 28px;font-size:14px;letter-spacing:.12em">VIZAJE-NICA PARTNERS</p><h1 style="margin:0 0 18px;font-size:26px;font-weight:500;line-height:1.2">${escapeHtml(title)}</h1>${body}${action}<p style="margin-top:36px;color:#777;font-size:13px">Vizaje-Nica Partners</p></main></body></html>`
  return html
}

export function createApplicationEmailContent({
  event,
  locale,
  fullName,
  activationInvitationId,
  rejectionReason,
}: {
  event: ApplicationEmailEvent
  locale: "ru" | "ro"
  fullName: string
  activationInvitationId?: string
  rejectionReason?: string
}): EmailContent {
  const env = getApiEnv()
  const firstName = escapeHtml(fullName.trim().split(/\s+/)[0] || fullName)
  const isRomanian = locale === "ro"
  const messages = isRomanian
    ? {
        submitted: { subject: "Am primit candidatura ta — Vizaje-Nica Partners", title: "Candidatura a fost primită", body: `<p>Salut, ${firstName}!</p><p>Îți mulțumim pentru interesul față de programul de parteneriat Vizaje-Nica. Am primit candidatura și o vom analiza.</p>` },
        in_review: { subject: "Candidatura ta este în curs de analiză — Vizaje-Nica Partners", title: "Candidatura este în curs de analiză", body: `<p>Salut, ${firstName}!</p><p>Candidatura ta pentru programul de parteneriat Vizaje-Nica a intrat în etapa de analiză. Îți vom comunica decizia prin email.</p>` },
        approved: { subject: "Candidatura ta a fost aprobată — Vizaje-Nica Partners", title: "Candidatura a fost aprobată", body: `<p>Salut, ${firstName}!</p><p>Felicitări! Candidatura ta a fost aprobată. Creează o parolă pentru a activa contul de creator. Linkul este valabil 7 zile și poate fi folosit o singură dată.</p>` },
        rejected: { subject: "Actualizare privind candidatura ta — Vizaje-Nica Partners", title: "Actualizare privind candidatura", body: `<p>Salut, ${firstName}!</p><p>Îți mulțumim pentru interesul față de Vizaje-Nica. De această dată nu putem accepta candidatura.</p><p><strong>Mesaj din partea echipei:</strong><br>${escapeHtml(cleanCandidateReason(rejectionReason ?? "" )).replace(/\n/g, "<br>")}</p>` },
      }
    : {
        submitted: { subject: "Мы получили вашу заявку — Vizaje-Nica Partners", title: "Заявка получена", body: `<p>Здравствуйте, ${firstName}!</p><p>Спасибо за интерес к партнёрской программе Vizaje-Nica. Мы получили вашу заявку и рассмотрим её.</p>` },
        in_review: { subject: "Ваша заявка на рассмотрении — Vizaje-Nica Partners", title: "Заявка на рассмотрении", body: `<p>Здравствуйте, ${firstName}!</p><p>Ваша заявка на участие в партнёрской программе Vizaje-Nica перешла на этап рассмотрения. Мы сообщим вам о решении по email.</p>` },
        approved: { subject: "Ваша заявка одобрена — Vizaje-Nica Partners", title: "Заявка одобрена", body: `<p>Здравствуйте, ${firstName}!</p><p>Поздравляем! Ваша заявка одобрена. Создайте пароль, чтобы активировать аккаунт креатора. Ссылка действует 7 дней и используется один раз.</p>` },
        rejected: { subject: "Информация по вашей заявке — Vizaje-Nica Partners", title: "Информация по заявке", body: `<p>Здравствуйте, ${firstName}!</p><p>Спасибо за интерес к Vizaje-Nica. К сожалению, сейчас мы не можем принять вашу заявку.</p><p><strong>Сообщение команды:</strong><br>${escapeHtml(cleanCandidateReason(rejectionReason ?? "")).replace(/\n/g, "<br>")}</p>` },
      }
  const message = messages[event]
  const button = event === "approved" && activationInvitationId
    ? { label: isRomanian ? "Activează contul" : "Активировать аккаунт", href: "{{ACTIVATION_URL}}" }
    : undefined
  const textByEvent: Record<ApplicationEmailEvent, string> = isRomanian
    ? {
        submitted: `Salut, ${fullName}! Am primit candidatura ta la programul de parteneriat Vizaje-Nica și o vom analiza.`,
        in_review: `Salut, ${fullName}! Candidatura ta Vizaje-Nica este în curs de analiză. Îți vom comunica decizia prin email.`,
        approved: `Salut, ${fullName}! Candidatura ta a fost aprobată. Creează o parolă pentru activarea contului. Linkul este valabil 7 zile și poate fi folosit o singură dată. {{ACTIVATION_URL}}`,
        rejected: `Salut, ${fullName}! De această dată nu putem accepta candidatura. Mesaj din partea echipei: ${cleanCandidateReason(rejectionReason ?? "")}`,
      }
    : {
        submitted: `Здравствуйте, ${fullName}! Мы получили вашу заявку в партнёрскую программу Vizaje-Nica и рассмотрим её.`,
        in_review: `Здравствуйте, ${fullName}! Ваша заявка Vizaje-Nica находится на рассмотрении. Мы сообщим решение по email.`,
        approved: `Здравствуйте, ${fullName}! Ваша заявка одобрена. Создайте пароль для активации аккаунта. Ссылка действует 7 дней и используется один раз. {{ACTIVATION_URL}}`,
        rejected: `Здравствуйте, ${fullName}! Сейчас мы не можем принять вашу заявку. Сообщение команды: ${cleanCandidateReason(rejectionReason ?? "")}`,
      }
  return {
    subject: message.subject,
    html: emailFrame(message.title, message.body, button),
    text: textByEvent[event],
    sender: env.EMAIL_FROM,
    webAppUrl: env.WEB_APP_URL,
    ...(activationInvitationId ? { activationInvitationId } : {}),
  }
}

function retryDelayMs(attemptCount: number) {
  return Math.min(60 * 1000 * 2 ** Math.max(0, attemptCount - 1), 6 * 60 * 60 * 1000)
}

async function claimEmailDelivery(id: string) {
  const db = getDb()
  const now = new Date()
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS)
  const claimable = or(
    and(eq(emailDeliveries.status, "queued"), lte(emailDeliveries.nextAttemptAt, now), lt(emailDeliveries.attemptCount, MAX_ATTEMPTS)),
    and(eq(emailDeliveries.status, "sending"), lte(emailDeliveries.lastAttemptAt, staleBefore), lt(emailDeliveries.attemptCount, MAX_ATTEMPTS)),
  )!
  const rows = await db
    .update(emailDeliveries)
    .set({ status: "sending", attemptCount: sql`${emailDeliveries.attemptCount} + 1`, lastAttemptAt: now, updatedAt: now })
    .where(and(eq(emailDeliveries.id, id), claimable))
    .returning()
  return rows[0]
}

async function recordFailure(deliveryId: string, attemptCount: number, message: string, retryable: boolean) {
  const shouldRetry = retryable && attemptCount < MAX_ATTEMPTS
  const now = new Date()
  await getDb().update(emailDeliveries).set({
    status: shouldRetry ? "queued" : "failed",
    nextAttemptAt: shouldRetry ? new Date(now.getTime() + retryDelayMs(attemptCount)) : now,
    lastError: message,
    updatedAt: now,
  }).where(eq(emailDeliveries.id, deliveryId))
}

export async function processEmailDelivery(deliveryId: string) {
  let claimed: Awaited<ReturnType<typeof claimEmailDelivery>>
  try {
    claimed = await claimEmailDelivery(deliveryId)
  } catch (error) {
    logger.error({ deliveryId, errorName: error instanceof Error ? error.name : "UnknownError" }, "email delivery could not be claimed")
    return
  }
  if (!claimed) return

  const env = getApiEnv()
  if (!env.RESEND_API_KEY) {
    await recordFailure(deliveryId, claimed.attemptCount, "Email delivery is not configured (RESEND_API_KEY is missing).", false)
    return
  }

  try {
    if (
      claimed.firstProviderAttemptAt
      && Date.now() - claimed.firstProviderAttemptAt.getTime() >= EMAIL_IDEMPOTENCY_WINDOW_MS
      && (claimed.attemptCount > 1 || hasAmbiguousDeliveryOutcome(claimed.lastError))
    ) {
      await recordFailure(deliveryId, claimed.attemptCount, EMAIL_RECONCILIATION_REQUIRED, false)
      logger.warn({ deliveryId, attemptCount: claimed.attemptCount }, "email delivery requires provider reconciliation")
      return
    }

    const content = await decryptEmailContent(claimed.encryptedPayload)
    const link = content.activationInvitationId
      ? await activationUrl(content.activationInvitationId, content.webAppUrl ?? env.WEB_APP_URL)
      : ""
    const contentWithLink = {
      subject: content.subject,
      html: content.html.replaceAll("{{ACTIVATION_URL}}", escapeHtml(link)),
      text: content.text.replaceAll("{{ACTIVATION_URL}}", link),
    }
    await getDb().update(emailDeliveries).set({
      firstProviderAttemptAt: sql`coalesce(${emailDeliveries.firstProviderAttemptAt}, now())`,
      updatedAt: new Date(),
    }).where(and(eq(emailDeliveries.id, deliveryId), eq(emailDeliveries.status, "sending")))

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "Idempotency-Key": claimed.eventKey,
      },
      body: JSON.stringify({ from: content.sender ?? env.EMAIL_FROM, to: [claimed.recipientEmail], ...contentWithLink }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500
      await recordFailure(deliveryId, claimed.attemptCount, `Email provider returned HTTP ${response.status}.`, retryable)
      return
    }

    const providerResult = await response.json().catch(() => null) as { id?: unknown } | null
    await getDb().update(emailDeliveries).set({
      status: "sent",
      sentAt: new Date(),
      providerMessageId: typeof providerResult?.id === "string" ? providerResult.id : null,
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(emailDeliveries.id, deliveryId))
  } catch (error) {
    const message = error instanceof DOMException && error.name === "TimeoutError"
      ? "Email provider request timed out."
      : "Email provider request failed."
    try {
      await recordFailure(deliveryId, claimed.attemptCount, message, true)
    } catch (recordError) {
      logger.error({ deliveryId, errorName: recordError instanceof Error ? recordError.name : "UnknownError" }, "email delivery failure could not be recorded")
    }
    logger.warn({ deliveryId, attemptCount: claimed.attemptCount }, "email delivery attempt failed")
  }
}

export async function dispatchDueEmailDeliveries(limit = 30) {
  const now = new Date()
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS)
  await getDb().update(emailDeliveries).set({
    status: "failed",
    lastError: "Delivery attempt limit reached after an interrupted attempt.",
    updatedAt: now,
  }).where(and(
    eq(emailDeliveries.status, "sending"),
    lte(emailDeliveries.lastAttemptAt, staleBefore),
    gte(emailDeliveries.attemptCount, MAX_ATTEMPTS),
  ))

  const due = await getDb().select({ id: emailDeliveries.id }).from(emailDeliveries).where(or(
    and(eq(emailDeliveries.status, "queued"), lte(emailDeliveries.nextAttemptAt, now), lt(emailDeliveries.attemptCount, MAX_ATTEMPTS)),
    and(eq(emailDeliveries.status, "sending"), lte(emailDeliveries.lastAttemptAt, staleBefore), lt(emailDeliveries.attemptCount, MAX_ATTEMPTS)),
  )).limit(limit)
  await Promise.allSettled(due.map(({ id }) => processEmailDelivery(id)))
}
