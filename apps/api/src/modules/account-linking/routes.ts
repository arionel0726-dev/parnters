import { z } from "zod"
import { Hono } from "hono"
import type { Context } from "hono"
import type { ApiEnv } from "../../auth/middleware"
import { requireAuth, requirePartner } from "../../auth/middleware"
import { getApiEnv } from "../../env"
import { apiError } from "../../http/errors"
import { rateLimit } from "../../http/rate-limit"
import {
  configuredAccountLinkRedirectUri,
  confirmAccountLinkInitiation,
  exchangeAccountLinkCode,
  getPartnerAccountLinkState,
  inspectAccountLinkInitiation,
  issueAccountLinkInitiation,
} from "./service"
import { hasLegacyToPartnersHmacConfiguration, requireLegacyToPartnersHmac } from "./service-auth"

const initiationSchema = z.object({
  legacyClientId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/),
  redirectUri: z.string().url(),
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  state: z.string().regex(/^[A-Za-z0-9_-]{22,256}$/),
}).strict()

const browserTicketSchema = z.object({
  ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict()

const confirmSchema = z.object({
  ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  confirmed: z.literal(true),
}).strict()

const exchangeSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  legacyClientId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  redirectUri: z.string().url(),
  codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
}).strict()

const statusSchema = z.object({ partnerId: z.string().uuid() }).strict()

function requireTrustedOrigin(c: Context<ApiEnv>) {
  const origin = c.req.header("origin")
  return Boolean(origin && getApiEnv().AUTH_TRUSTED_ORIGINS.includes(origin))
}

function noStore(c: Context<ApiEnv>) {
  c.header("Cache-Control", "no-store")
  c.header("Referrer-Policy", "no-referrer")
}

export const creatorAccountLinkRoutes = new Hono<ApiEnv>()
creatorAccountLinkRoutes.use("*", requireAuth, async (c, next) => {
  if (!requireTrustedOrigin(c)) return apiError(c, 403, "CSRF_ORIGIN_INVALID", "A trusted browser origin is required.")
  await next()
}, requirePartner)

creatorAccountLinkRoutes.post("/inspect", rateLimit((c) => `account-link-inspect:${c.get("partner").id}`, 20, 60_000), async (c) => {
  noStore(c)
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_REQUEST", "Invalid account linking request.")
  }
  const parsed = browserTicketSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "INVALID_REQUEST", "Invalid account linking request.")

  const result = await inspectAccountLinkInitiation(parsed.data.ticket)
  if (result.kind === "invalid_ticket") return apiError(c, 400, "AUTHORIZATION_TICKET_INVALID", "This account linking attempt is invalid or expired.")
  return c.json({ expiresAt: result.expiresAt.toISOString() })
})

creatorAccountLinkRoutes.post("/authorize", rateLimit((c) => `account-link-authorize:${c.get("partner").id}`, 5, 60_000), async (c) => {
  noStore(c)
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_REQUEST", "Invalid account linking request.")
  }
  const parsed = confirmSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "INVALID_REQUEST", "Explicit confirmation is required.")

  const result = await confirmAccountLinkInitiation({ ticket: parsed.data.ticket, partnerId: c.get("partner").id })
  if (result.kind === "invalid_configuration") return apiError(c, 503, "ACCOUNT_LINKING_NOT_CONFIGURED", "Account linking is not configured.")
  if (result.kind === "invalid_ticket") return apiError(c, 400, "AUTHORIZATION_TICKET_INVALID", "This account linking attempt is invalid or expired.")
  if (result.kind === "partner_not_active") return apiError(c, 403, "PARTNER_NOT_ACTIVE", "Partner is not active.")
  return c.json({ callbackUrl: result.callbackUrl, expiresAt: result.expiresAt.toISOString() }, 200)
})

export const legacyAccountLinkRoutes = new Hono<ApiEnv>()
legacyAccountLinkRoutes.use("*", requireLegacyToPartnersHmac)

legacyAccountLinkRoutes.post("/initiate", async (c) => {
  noStore(c)
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_REQUEST", "Invalid account linking initiation.")
  }
  const parsed = initiationSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "INVALID_REQUEST", "Invalid account linking initiation.")

  if (!configuredAccountLinkRedirectUri() || !hasLegacyToPartnersHmacConfiguration()) {
    return apiError(c, 503, "ACCOUNT_LINKING_NOT_CONFIGURED", "Account linking is not configured.")
  }
  const result = await issueAccountLinkInitiation({
    legacyClientId: parsed.data.legacyClientId,
    redirectUri: parsed.data.redirectUri,
    pkceChallenge: parsed.data.codeChallenge,
    state: parsed.data.state,
  })
  if (result.kind === "invalid_redirect") return apiError(c, 400, "REDIRECT_URI_INVALID", "Redirect URI is not allowed.")
  if (result.kind === "invalid_configuration") return apiError(c, 503, "ACCOUNT_LINKING_NOT_CONFIGURED", "Account linking is not configured.")
  return c.json({ ticket: result.ticket, authorizeUrl: result.authorizeUrl, expiresAt: result.expiresAt.toISOString() }, 201)
})

legacyAccountLinkRoutes.post("/exchange", async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_REQUEST", "Invalid account linking request.")
  }
  const parsed = exchangeSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "INVALID_REQUEST", "Invalid account linking request.")

  const result = await exchangeAccountLinkCode(parsed.data)
  if (result.kind === "invalid_code") return apiError(c, 400, "AUTHORIZATION_CODE_INVALID", "Authorization code is invalid or expired.")
  if (result.kind === "partner_not_active") return apiError(c, 403, "PARTNER_NOT_ACTIVE", "Partner is not active.")
  return c.json({ partnerId: result.partner.partnerId, creatorId: result.partner.creatorId, type: result.partner.type, status: result.partner.status })
})

legacyAccountLinkRoutes.post("/partner-status", async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_REQUEST", "Invalid account linking request.")
  }
  const parsed = statusSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "INVALID_REQUEST", "Invalid account linking request.")

  const state = await getPartnerAccountLinkState(parsed.data.partnerId)
  if (!state) return apiError(c, 404, "PARTNER_NOT_FOUND", "Partner was not found.")
  return c.json(state)
})
