import { referralCodeInputSchema, referralLinkCreateSchema, referralLinkListQuerySchema, referralLinkRenameSchema } from "@vizaje/contracts"
import { Hono } from "hono"
import type { ApiEnv } from "../../auth/middleware"
import { requireAuth, requirePartner } from "../../auth/middleware"
import { getApiEnv } from "../../env"
import { apiError } from "../../http/errors"
import { rateLimit } from "../../http/rate-limit"
import { listReferralLinks, getReferralLinkForPartner, getReferralLinksForPartner, getReferralLinkStats } from "./repository"
import { InvalidReferralDestinationError } from "./destinations"
import { createReferralLink, recordReferralClickForResolvedLink, renameReferralLink, resolveActiveReferralCode, revokeReferralLink, serializeReferralLink, validateActiveReferralCode } from "./service"
import { addAttributionHandoff, createAttributionForResolvedLink, isReferralAnalyticsPartnerAllowed } from "../referral-analytics/service"
import {
  LegacyResolverConfigurationError,
  LegacyResolverInvalidResponseError,
  LegacyResolverRejectedError,
  LegacyResolverUnavailableError,
} from "./legacy-resolver"

export const partnerReferralLinkRoutes = new Hono<ApiEnv>()

partnerReferralLinkRoutes.use("*", requireAuth, requirePartner)

partnerReferralLinkRoutes.get("/", async (c) => {
  const parsed = referralLinkListQuerySchema.safeParse({ status: c.req.query("status") })
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Некорректный статус ссылки.", parsed.error.flatten().fieldErrors)
  const rows = await listReferralLinks(c.get("partner").id, parsed.data.status === "all" ? undefined : parsed.data.status)
  const stats = await getReferralLinkStats(rows.map((row) => row.id))
  return c.json({ links: rows.map((row) => ({ ...serializeReferralLink(row), ...stats.get(row.id) })) })
})

partnerReferralLinkRoutes.post("/", rateLimit((c) => `creator-link-create:${c.get("partner").id}`, 10, 60_000), async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Проверьте ссылку.")
  }
  const parsed = referralLinkCreateSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Проверьте тип и ссылку.", parsed.error.flatten().fieldErrors)

  try {
    const result = await createReferralLink(c.get("partner").id, parsed.data, c.get("auth").user.id)
    if (result.kind === "not_eligible") return apiError(c, 403, "PARTNER_NOT_ELIGIBLE", "Ссылки доступны только активным creators.")
    if (result.kind === "invalid_expiry") return apiError(c, 400, "INVALID_EXPIRY", "Дата окончания ссылки должна быть в будущем.")
    return c.json({ link: result.link }, 201)
  } catch (error) {
    if (error instanceof InvalidReferralDestinationError) return apiError(c, 400, "INVALID_DESTINATION", error.message)
    if (error instanceof LegacyResolverConfigurationError || error instanceof LegacyResolverUnavailableError) {
      return apiError(c, 503, "LEGACY_RESOLVER_UNAVAILABLE", "Проверка страницы временно недоступна. Данные формы сохранены — попробуйте позже.")
    }
    if (error instanceof LegacyResolverInvalidResponseError) {
      return apiError(c, 502, "LEGACY_RESOLVER_BAD_RESPONSE", "Не удалось проверить страницу. Попробуйте позже.")
    }
    if (error instanceof LegacyResolverRejectedError) {
      const statusByCode: Record<string, 400 | 405 | 409 | 404 | 410 | 422 | 429 | 503 | 502> = {
        INVALID_TARGET: 400,
        METHOD_NOT_ALLOWED: 405,
        HOST_NOT_ALLOWED: 400,
        TYPE_MISMATCH: 409,
        LOCALE_MISMATCH: 409,
        AMBIGUOUS_TARGET: 409,
        ENTITY_NOT_FOUND: 404,
        ENTITY_UNAVAILABLE: 410,
        UNSUPPORTED_ROUTE: 422,
        LOCALE_UNAVAILABLE: 422,
        RATE_LIMITED: 429,
        LEGACY_TEMPORARILY_UNAVAILABLE: 503,
        SERVICE_AUTH_INVALID: 502,
        SERVICE_TIMESTAMP_INVALID: 502,
        AUTH_NONCE_REPLAY: 502,
      }
      const status = statusByCode[error.code] ?? 502
      const message = error.code === "AMBIGUOUS_TARGET"
        ? "Не удалось однозначно определить страницу. Проверьте ссылку."
        : error.code === "ENTITY_NOT_FOUND" || error.code === "ENTITY_UNAVAILABLE" || error.code === "LOCALE_UNAVAILABLE"
          ? "Страница не найдена или недоступна. Проверьте ссылку."
          : error.code === "RATE_LIMITED" || status === 503
            ? "Сервис каталога временно занят. Попробуйте позже."
            : "Ссылка не поддерживается или не соответствует выбранному типу."
      const responseCode = status === 503 ? "LEGACY_RESOLVER_UNAVAILABLE" : `LEGACY_${error.code}`
      return apiError(c, status, responseCode, message)
    }
    throw error
  }
})

partnerReferralLinkRoutes.get("/:id", async (c) => {
  const link = await getReferralLinkForPartner(c.get("partner").id, c.req.param("id"))
  if (!link) return apiError(c, 404, "REFERRAL_LINK_NOT_FOUND", "Referral link не найдена.")
  return c.json({ link: await withReferralLinkStats(serializeReferralLink(link)) })
})

partnerReferralLinkRoutes.patch("/:id", async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Укажите название ссылки.")
  }
  const parsed = referralLinkRenameSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Проверьте название ссылки.", parsed.error.flatten().fieldErrors)

  const result = await renameReferralLink(c.get("partner").id, c.req.param("id"), parsed.data, c.get("auth").user.id)
  if (result.kind === "not_found") return apiError(c, 404, "REFERRAL_LINK_NOT_FOUND", "Referral link не найдена.")
  return c.json({ link: await withReferralLinkStats(result.link) })
})

partnerReferralLinkRoutes.patch("/:id/revoke", async (c) => {
  const result = await revokeReferralLink(c.get("partner").id, c.req.param("id"), c.get("auth").user.id)
  if (result.kind === "not_found") return apiError(c, 404, "REFERRAL_LINK_NOT_FOUND", "Referral link не найдена.")
  return c.json({ idempotent: result.kind === "already_revoked", link: await withReferralLinkStats(result.link) })
})

export const internalReferralLinkRoutes = new Hono<ApiEnv>()

internalReferralLinkRoutes.use("/validate", rateLimit("internal-referral-validation", 120, 60_000))
internalReferralLinkRoutes.use("/click", rateLimit("internal-referral-click", 600, 60_000))

internalReferralLinkRoutes.post("/validate", async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Укажите referral code.")
  }
  const parsed = referralCodeInputSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Укажите корректный referral code.", parsed.error.flatten().fieldErrors)
  const result = await validateActiveReferralCode(parsed.data.code)
  return c.json(result ? { valid: true, link: result } : { valid: false })
})

internalReferralLinkRoutes.post("/click", async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Укажите referral code.")
  }
  const parsed = referralCodeInputSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Укажите корректный referral code.", parsed.error.flatten().fieldErrors)
  const result = await resolveActiveReferralCode(parsed.data.code)
  if (!result) return c.json({ valid: false })

  const env = getApiEnv()
  const requestedLocale = c.req.header("x-referral-locale")
  const locale = requestedLocale === "ru" || requestedLocale === "ro" ? requestedLocale : null
  const serialized = serializeReferralLink(result.link)
  let redirectUrl = serialized.targetUrl

  if (env.REFERRAL_ANALYTICS_ENABLED && isReferralAnalyticsPartnerAllowed(result.link.partnerId)) {
    const visitKey = c.req.header("x-referral-visit-id") ?? null
    const attribution = await createAttributionForResolvedLink(result, visitKey)
    if (env.REFERRAL_TRACKING_ENABLED && attribution.created) {
      await recordReferralClickForResolvedLink(result, locale, attribution.attribution.id)
    }
    if (attribution.handoffToken) redirectUrl = addAttributionHandoff(serialized.targetUrl, attribution.handoffToken)
  } else if (env.REFERRAL_TRACKING_ENABLED) {
    await recordReferralClickForResolvedLink(result, locale)
  }

  return c.json({ valid: true, link: serialized, redirectUrl })
})

export async function listAdminReferralLinks(partnerId: string) {
  const rows = await getReferralLinksForPartner(partnerId)
  const stats = await getReferralLinkStats(rows.map(({ link }) => link.id))
  return rows.map(({ link }) => ({ ...serializeReferralLink(link), ...stats.get(link.id) }))
}

async function withReferralLinkStats(link: ReturnType<typeof serializeReferralLink>) {
  const stats = await getReferralLinkStats([link.id])
  return { ...link, ...stats.get(link.id) }
}
