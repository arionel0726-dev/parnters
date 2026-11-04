import { partnerAgreementInputSchema, partnerListQuerySchema, partnerStatusUpdateSchema } from "@vizaje/contracts"
import { Hono } from "hono"
import type { ApiEnv } from "../../auth/middleware"
import { requirePermission } from "../../auth/middleware"
import { apiError } from "../../http/errors"
import { getPartnerRecord, listPartners } from "./repository"
import { createPartnerAgreement, updatePartnerStatus } from "./service"
import { listAdminReferralLinks } from "../referral-links/routes"

export const adminPartnerRoutes = new Hono<ApiEnv>()

adminPartnerRoutes.get("/", requirePermission("partners:read"), async (c) => {
  const parsed = partnerListQuerySchema.safeParse({
    status: c.req.query("status"),
    type: c.req.query("type"),
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
    search: c.req.query("search"),
  })
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Некорректные параметры списка.", parsed.error.flatten().fieldErrors)
  const result = await listPartners(parsed.data)
  return c.json({ ...result, page: parsed.data.page, pageSize: parsed.data.pageSize })
})

adminPartnerRoutes.get("/:id/referral-links", requirePermission("partners:read"), async (c) => {
  const partner = await getPartnerRecord(c.req.param("id"))
  if (!partner) return apiError(c, 404, "PARTNER_NOT_FOUND", "Партнёр не найден.")
  return c.json({ links: await listAdminReferralLinks(c.req.param("id")) })
})

adminPartnerRoutes.get("/:id", requirePermission("partners:read"), async (c) => {
  const result = await getPartnerRecord(c.req.param("id"))
  if (!result) return apiError(c, 404, "PARTNER_NOT_FOUND", "Партнёр не найден.")
  return c.json(result)
})

adminPartnerRoutes.patch("/:id/status", requirePermission("partners:write"), async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Проверьте статус и причину.")
  }
  const parsed = partnerStatusUpdateSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Проверьте статус и причину.", parsed.error.flatten().fieldErrors)
  const result = await updatePartnerStatus(c.req.param("id"), parsed.data.status, parsed.data.reason, c.get("auth").user.id)
  if (result.kind === "not_found") return apiError(c, 404, "PARTNER_NOT_FOUND", "Партнёр не найден.")
  return c.json({ idempotent: result.kind === "unchanged", partner: result.partner })
})

adminPartnerRoutes.post("/:id/agreements", requirePermission("agreements:write"), async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Проверьте настройки комиссии.")
  }
  const parsed = partnerAgreementInputSchema.safeParse(payload)
  if (!parsed.success) return apiError(c, 400, "VALIDATION_ERROR", "Проверьте настройки комиссии.", parsed.error.flatten().fieldErrors)
  const result = await createPartnerAgreement(c.req.param("id"), parsed.data, c.get("auth").user.id)
  if (result.kind === "not_found") return apiError(c, 404, "PARTNER_NOT_FOUND", "Партнёр не найден.")
  if (result.kind === "invalid_date") return apiError(c, 400, "INVALID_DATE", "Укажите корректную дату начала.")
  if (result.kind === "conflict") return apiError(c, 409, "AGREEMENT_DATE_CONFLICT", result.message)
  return c.json({ agreement: result.agreement }, 201)
})

