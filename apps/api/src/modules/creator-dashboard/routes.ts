import { creatorDashboardResponseSchema, creatorProfileResponseSchema, creatorProfileUpdateSchema } from "@vizaje/contracts"
import { Hono } from "hono"
import { requireAuth, requirePartner, type ApiEnv } from "../../auth/middleware"
import { apiError } from "../../http/errors"
import { getCreatorDashboard, updateCreatorProfile } from "./repository"

export const creatorDashboardRoutes = new Hono<ApiEnv>()

creatorDashboardRoutes.use("*", requireAuth, requirePartner)

creatorDashboardRoutes.get("/dashboard", async (c) => {
  const result = await getCreatorDashboard(c.get("auth").user.id, c.get("partner").id)
  if (!result) return apiError(c, 403, "PARTNER_ACCESS_REQUIRED", "Активный доступ к кабинету креатора не найден.")
  return c.json(creatorDashboardResponseSchema.parse(result))
})

creatorDashboardRoutes.get("/profile", async (c) => {
  const result = await getCreatorDashboard(c.get("auth").user.id, c.get("partner").id)
  if (!result) return apiError(c, 403, "PARTNER_ACCESS_REQUIRED", "Активный доступ к кабинету креатора не найден.")
  return c.json({ profile: creatorProfileResponseSchema.parse(result.profile) })
})

creatorDashboardRoutes.patch("/profile", async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Проверьте данные профиля.")
  }

  const parsed = creatorProfileUpdateSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Проверьте данные профиля.", parsed.error.flatten().fieldErrors)

  const suppliedSocialFields = ["instagram", "tiktok", "otherSocial"].filter((field) =>
    Object.prototype.hasOwnProperty.call(payload, field),
  )
  try {
    const result = await updateCreatorProfile(c.get("auth").user.id, c.get("partner").id, parsed.data, suppliedSocialFields)
    if (result.kind === "not_eligible") return apiError(c, 403, "PARTNER_ACCESS_REQUIRED", "Активный доступ к кабинету креатора не найден.")

    const dashboard = await getCreatorDashboard(c.get("auth").user.id, c.get("partner").id)
    if (!dashboard) return apiError(c, 403, "PARTNER_ACCESS_REQUIRED", "Активный доступ к кабинету креатора не найден.")
    return c.json({ profile: creatorProfileResponseSchema.parse(dashboard.profile) })
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } }
    if (databaseError.code === "23505" || databaseError.cause?.code === "23505") {
      return apiError(c, 409, "PROFILE_CONFLICT", "Эти контактные данные уже используются.")
    }
    throw error
  }
})
