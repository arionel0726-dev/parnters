import { createHash } from "node:crypto"
import { z } from "zod"
import { referralLinkCreateSchema, referralLinkListQuerySchema } from "@vizaje/contracts"
import { Hono } from "hono"
import type { Context } from "hono"
import type { ApiEnv } from "../../auth/middleware"
import { apiError } from "../../http/errors"
import { requireFeature } from "../../http/feature-flags"
import { rateLimit } from "../../http/rate-limit"
import { requireLegacyToPartnersHmac } from "../account-linking/service-auth"
import { getCreatorReferralAnalytics } from "../referral-analytics/service"
import { getReferralLinkStats, listReferralLinks } from "../referral-links/repository"
import { InvalidReferralDestinationError } from "../referral-links/destinations"
import {
  LegacyResolverConfigurationError,
  LegacyResolverInvalidResponseError,
  LegacyResolverRejectedError,
  LegacyResolverUnavailableError,
} from "../referral-links/legacy-resolver"
import { createReferralLink, revokeReferralLink, serializeReferralLink } from "../referral-links/service"
import { authorizeLegacyCreatorGrant, legacyCreatorDashboardScopes, revokeLegacyCreatorGrant } from "./service"

const grantCredentials = {
  grantToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  legacyClientId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/),
}

const analyticsSchema = z.object(grantCredentials).strict()
const listSchema = z.object({
  ...grantCredentials,
  status: z.enum(["all", "active", "revoked"]).default("all"),
}).strict()
const createSchema = z.object({
  ...grantCredentials,
  idempotencyKey: z.string().uuid(),
  link: referralLinkCreateSchema,
}).strict()
const unlinkSchema = z.object(grantCredentials).strict()

function parseJsonRequest(c: Context<ApiEnv>): Promise<unknown> {
  return c.req.json().catch(() => null)
}

type GrantDenial = Exclude<Awaited<ReturnType<typeof authorizeLegacyCreatorGrant>>, { kind: "authorized" }>

function grantError(c: Context<ApiEnv>, result: GrantDenial) {
  if (result.kind === "invalid_grant") return apiError(c, 401, "ACCOUNT_LINK_GRANT_INVALID", "Account linking grant is invalid.")
  if (result.kind === "partner_not_active") return apiError(c, 403, "PARTNER_NOT_ACTIVE", "The linked creator account is not active.")
  if (result.kind === "scope_required") return apiError(c, 403, "ACCOUNT_LINK_SCOPE_REQUIRED", "The linked account does not have permission for this operation.")
}

function createError(c: Context<ApiEnv>, error: unknown) {
  if (error instanceof InvalidReferralDestinationError) return apiError(c, 400, "INVALID_DESTINATION", error.message)
  if (error instanceof LegacyResolverConfigurationError || error instanceof LegacyResolverUnavailableError) {
    return apiError(c, 503, "LEGACY_RESOLVER_UNAVAILABLE", "The destination could not be verified right now.")
  }
  if (error instanceof LegacyResolverInvalidResponseError) {
    return apiError(c, 502, "LEGACY_RESOLVER_BAD_RESPONSE", "The destination could not be verified.")
  }
  if (error instanceof LegacyResolverRejectedError) {
    const code = error.code === "ENTITY_NOT_FOUND" ? "LEGACY_ENTITY_NOT_FOUND" : `LEGACY_${error.code}`
    const status: 400 | 404 | 409 | 410 | 429 | 503 = error.code === "ENTITY_NOT_FOUND" ? 404
      : error.code === "ENTITY_UNAVAILABLE" ? 410
        : error.code === "RATE_LIMITED" ? 429
          : error.code === "LEGACY_TEMPORARILY_UNAVAILABLE" ? 503
            : error.code === "TYPE_MISMATCH" || error.code === "LOCALE_MISMATCH" || error.code === "AMBIGUOUS_TARGET" ? 409
              : 400
    return apiError(c, status, code, "The destination is not supported or could not be verified.")
  }
  return null
}

export const legacyCreatorDashboardRoutes = new Hono<ApiEnv>()
legacyCreatorDashboardRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store")
  c.header("Referrer-Policy", "no-referrer")
  await next()
})
legacyCreatorDashboardRoutes.use("*", requireLegacyToPartnersHmac)
legacyCreatorDashboardRoutes.use("/analytics", requireFeature("REFERRAL_ANALYTICS_ENABLED"))
legacyCreatorDashboardRoutes.use("/analytics", rateLimit("legacy-creator-dashboard-analytics", 120, 60_000))
legacyCreatorDashboardRoutes.use("/referral-links/*", rateLimit("legacy-creator-dashboard-links", 120, 60_000))

legacyCreatorDashboardRoutes.post("/analytics", async (c) => {
  const body = await parseJsonRequest(c)
  const parsed = analyticsSchema.safeParse(body)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Invalid creator analytics request.")

  const grant = await authorizeLegacyCreatorGrant({ ...parsed.data, scope: legacyCreatorDashboardScopes.analyticsRead })
  if (grant.kind !== "authorized") return grantError(c, grant)
  return c.json(await getCreatorReferralAnalytics(grant.partner.id))
})

legacyCreatorDashboardRoutes.post("/referral-links/list", async (c) => {
  const body = await parseJsonRequest(c)
  const parsed = listSchema.safeParse(body)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Invalid referral link list request.")

  const grant = await authorizeLegacyCreatorGrant({ ...parsed.data, scope: legacyCreatorDashboardScopes.linksRead })
  if (grant.kind !== "authorized") return grantError(c, grant)
  const filter = referralLinkListQuerySchema.safeParse({ status: parsed.data.status })
  if (!filter.success) return apiError(c, 400, "VALIDATION_ERROR", "Invalid referral link status.")
  const links = await listReferralLinks(grant.partner.id, filter.data.status === "all" ? undefined : filter.data.status)
  const stats = await getReferralLinkStats(links.map((link) => link.id))
  return c.json({ links: links.map((link) => ({ ...serializeReferralLink(link), ...stats.get(link.id) })) })
})

legacyCreatorDashboardRoutes.post("/referral-links/create", async (c) => {
  const body = await parseJsonRequest(c)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Invalid referral link request.")

  const grant = await authorizeLegacyCreatorGrant({ ...parsed.data, scope: legacyCreatorDashboardScopes.linksWrite })
  if (grant.kind !== "authorized") return grantError(c, grant)

  const requestHash = createHash("sha256").update(JSON.stringify(parsed.data.link), "utf8").digest("hex")
  try {
    const result = await createReferralLink(grant.partner.id, parsed.data.link, null, {
      idempotency: { grantId: grant.grantId, key: parsed.data.idempotencyKey, requestHash },
    })
    if (result.kind === "not_eligible") return apiError(c, 403, "PARTNER_NOT_ELIGIBLE", "Referral links are available only to active creators.")
    if (result.kind === "invalid_expiry") return apiError(c, 400, "INVALID_EXPIRY", "The expiration date must be in the future.")
    if (result.kind === "idempotency_conflict") return apiError(c, 409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different request.")
    return c.json({ link: result.link, idempotent: result.kind === "idempotent" }, result.kind === "created" ? 201 : 200)
  } catch (error) {
    const mapped = createError(c, error)
    if (mapped) return mapped
    throw error
  }
})

legacyCreatorDashboardRoutes.post("/referral-links/:linkId/revoke", async (c) => {
  const linkId = z.string().uuid().safeParse(c.req.param("linkId"))
  if (!linkId.success) return apiError(c, 400, "INVALID_LINK_ID", "Invalid referral link identifier.")
  const body = await parseJsonRequest(c)
  const parsed = unlinkSchema.safeParse(body)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Invalid referral link request.")

  const grant = await authorizeLegacyCreatorGrant({ ...parsed.data, scope: legacyCreatorDashboardScopes.linksWrite })
  if (grant.kind !== "authorized") return grantError(c, grant)
  const result = await revokeReferralLink(grant.partner.id, linkId.data, null)
  if (result.kind === "not_found") return apiError(c, 404, "REFERRAL_LINK_NOT_FOUND", "Referral link was not found.")
  return c.json({ idempotent: result.kind === "already_revoked", link: result.link })
})

legacyCreatorDashboardRoutes.post("/unlink", async (c) => {
  const body = await parseJsonRequest(c)
  const parsed = unlinkSchema.safeParse(body)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Invalid account unlink request.")
  const result = await revokeLegacyCreatorGrant(parsed.data)
  if (result.kind === "invalid_grant") return apiError(c, 401, "ACCOUNT_LINK_GRANT_INVALID", "Account linking grant is invalid.")
  return c.json({ unlinked: true, idempotent: result.kind === "already_unlinked" })
})
