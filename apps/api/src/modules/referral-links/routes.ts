import { referralCodeInputSchema, referralLinkCreateSchema, referralLinkListQuerySchema, referralLinkRenameSchema } from "@vizaje/contracts"
import { Hono } from "hono"
import type { ApiEnv } from "../../auth/middleware"
import { requireAuth, requirePartner } from "../../auth/middleware"
import { apiError } from "../../http/errors"
import { rateLimit } from "../../http/rate-limit"
import { listReferralLinks, getReferralLinkForPartner, getReferralLinksForPartner } from "./repository"
import { InvalidReferralDestinationError } from "./destinations"
import { createReferralLink, renameReferralLink, revokeReferralLink, serializeReferralLink, validateActiveReferralCode } from "./service"

export const partnerReferralLinkRoutes = new Hono<ApiEnv>()

partnerReferralLinkRoutes.use("*", requireAuth, requirePartner)

partnerReferralLinkRoutes.get("/", async (c) => {
  const parsed = referralLinkListQuerySchema.safeParse({ status: c.req.query("status") })
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Некорректный статус ссылки.", parsed.error.flatten().fieldErrors)
  const rows = await listReferralLinks(c.get("partner").id, parsed.data.status === "all" ? undefined : parsed.data.status)
  return c.json({ links: rows.map(serializeReferralLink) })
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
    throw error
  }
})

partnerReferralLinkRoutes.get("/:id", async (c) => {
  const link = await getReferralLinkForPartner(c.get("partner").id, c.req.param("id"))
  if (!link) return apiError(c, 404, "REFERRAL_LINK_NOT_FOUND", "Referral link не найдена.")
  return c.json({ link: serializeReferralLink(link) })
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
  return c.json({ link: result.link })
})

partnerReferralLinkRoutes.patch("/:id/revoke", async (c) => {
  const result = await revokeReferralLink(c.get("partner").id, c.req.param("id"), c.get("auth").user.id)
  if (result.kind === "not_found") return apiError(c, 404, "REFERRAL_LINK_NOT_FOUND", "Referral link не найдена.")
  return c.json({ idempotent: result.kind === "already_revoked", link: result.link })
})

export const internalReferralLinkRoutes = new Hono<ApiEnv>()

internalReferralLinkRoutes.use("/validate", rateLimit("internal-referral-validation", 120, 60_000))

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

export async function listAdminReferralLinks(partnerId: string) {
  const rows = await getReferralLinksForPartner(partnerId)
  return rows.map(({ link }) => serializeReferralLink(link))
}
