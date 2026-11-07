import { timingSafeEqual } from "node:crypto"
import { getDb, partnerAccounts, partners, users } from "@vizaje/db"
import { and, eq, isNotNull } from "drizzle-orm"
import type { MiddlewareHandler } from "hono"
import { auth } from "./auth"
import { getApiEnv } from "../env"
import { hasPermission, type Permission } from "./permissions"

export type AuthenticatedRequest = {
  user: typeof users.$inferSelect
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>["session"]
}

export type ApiEnv = {
  Variables: {
    auth: AuthenticatedRequest
    partner: typeof partners.$inferSelect
  }
}

export const requireAuth: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) {
    return c.json({ status: "error", error: { code: "UNAUTHENTICATED", message: "Authentication required" } }, 401)
  }

  const db = getDb()
  const result = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)
  const user = result[0]

  if (!user || !user.isActive) {
    return c.json({ status: "error", error: { code: "UNAUTHENTICATED", message: "Authentication required" } }, 401)
  }

  c.set("auth", { user, session: session.session })
  await next()
}

/**
 * Creator accounts share the Better Auth session table with administrators,
 * but they must never inherit an administrator permission through a legacy
 * role value. Keep this check separate from RBAC so existing creator rows
 * remain protected until their role value is migrated.
 */
export const requireAdminAccess: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const current = c.get("auth")
  if (!current) {
    return c.json({ status: "error", error: { code: "UNAUTHENTICATED", message: "Authentication required" } }, 401)
  }

  const creatorAccount = await getDb()
    .select({ partnerId: partnerAccounts.partnerId })
    .from(partnerAccounts)
    .innerJoin(partners, eq(partnerAccounts.partnerId, partners.id))
    .where(and(eq(partnerAccounts.userId, current.user.id), eq(partners.type, "creator")))
    .limit(1)

  if (creatorAccount[0]) {
    return c.json({ status: "error", error: { code: "ADMIN_ACCESS_REQUIRED", message: "Administrator access is required" } }, 403)
  }

  await next()
}

export function requirePermission(permission: Permission): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const current = c.get("auth")
    if (!current || !hasPermission(current.user.role, permission)) {
      return c.json({ status: "error", error: { code: "FORBIDDEN", message: "Insufficient permissions" } }, 403)
    }

    await next()
  }
}

export const requirePartner: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const current = c.get("auth")
  if (!current) {
    return c.json({ status: "error", error: { code: "UNAUTHENTICATED", message: "Authentication required" } }, 401)
  }

  const result = await getDb()
    .select({ partner: partners })
    .from(partnerAccounts)
    .innerJoin(partners, eq(partnerAccounts.partnerId, partners.id))
    .where(
      and(
        eq(partnerAccounts.userId, current.user.id),
        eq(partners.type, "creator"),
        eq(partners.status, "active"),
        isNotNull(partners.creatorId),
      ),
    )
    .limit(1)

  const partner = result[0]?.partner
  if (!partner) {
    return c.json({ status: "error", error: { code: "PARTNER_ACCESS_REQUIRED", message: "Active creator access is required" } }, 403)
  }

  c.set("partner", partner)
  await next()
}

export const requireServiceAuth: MiddlewareHandler = async (c, next) => {
  const expected = getApiEnv().REFERRAL_SERVICE_TOKEN
  const provided = c.req.header("x-service-token") ?? ""
  const expectedBytes = Buffer.from(expected)
  const providedBytes = Buffer.from(provided)
  const valid = expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes)
  if (!valid) {
    return c.json({ status: "error", error: { code: "SERVICE_UNAUTHENTICATED", message: "Service authentication required" } }, 401)
  }

  await next()
}
