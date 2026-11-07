import { randomBytes } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { auditLogs, getDb, partners, referralLinkClicks, referralLinks } from "@vizaje/db"
import type { ReferralLinkCreateInput, ReferralLinkRenameInput } from "@vizaje/contracts"
import { getApiEnv } from "../../env"
import { buildTargetUrl, parseReferralDestination } from "./destinations"
import {
  LegacyResolverConfigurationError,
  LegacyResolverRejectedError,
  parseResolverSubmission,
  resolveLegacyTarget,
} from "./legacy-resolver"
import { getActiveReferralLinkByCode, getReferralLinkForPartner } from "./repository"

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export class ReferralLinkConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ReferralLinkConflictError"
  }
}

export function generateReferralCode() {
  const bytes = randomBytes(10)
  return Array.from(bytes, (value) => codeAlphabet[value % codeAlphabet.length]).join("")
}

export function serializeReferralLink(link: typeof referralLinks.$inferSelect) {
  const env = getApiEnv()
  const shortUrl = `${env.REFERRAL_SHORT_URL_ORIGIN.replace(/\/$/, "")}/r/${link.code}`
  const targetUrl = buildTargetUrl(link)
  const {
    partnerId: _partnerId,
    legacyEntityId: _legacyEntityId,
    legacyProductGuid: _legacyProductGuid,
    preferredLocale: _preferredLocale,
    fallbackLocale: _fallbackLocale,
    fallbackPath: _fallbackPath,
    canonicalRuPath: _canonicalRuPath,
    canonicalRoPath: _canonicalRoPath,
    resolverVersion: _resolverVersion,
    resolvedAt: _resolvedAt,
    ...publicLink
  } = link
  return { ...publicLink, isExpired: Boolean(link.expiresAt && link.expiresAt.getTime() <= Date.now()), shortUrl, targetUrl, clicks: 0, orders: 0 }
}

export async function recordReferralClick(code: string, locale: "ru" | "ro" | null) {
  const result = await getActiveReferralLinkByCode(code)
  if (!result?.creatorId) return null
  await getDb().insert(referralLinkClicks).values({
    referralLinkId: result.link.id,
    partnerId: result.link.partnerId,
    locale,
    clickedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return result
}

export async function createReferralLink(partnerId: string, input: ReferralLinkCreateInput, actorUserId: string) {
  const partnerRows = await getDb()
    .select({ id: partners.id, creatorId: partners.creatorId, type: partners.type, status: partners.status })
    .from(partners)
    .where(eq(partners.id, partnerId))
    .limit(1)
  const partner = partnerRows[0]
  if (!partner || partner.type !== "creator" || partner.status !== "active" || !partner.creatorId) {
    return { kind: "not_eligible" as const }
  }

  const env = getApiEnv()
  let destination: ReturnType<typeof parseReferralDestination>
  let resolvedMetadata: {
    legacyEntityId: string
    legacyProductGuid: string | null
    preferredLocale: "ru" | "ro"
    fallbackLocale: "ru" | "ro"
    fallbackPath: string
    canonicalRuPath: string | null
    canonicalRoPath: string | null
    resolverVersion: number
    resolvedAt: Date
  } | undefined

  if (env.LEGACY_RESOLVER_ENABLED) {
    const submission = parseResolverSubmission(input.targetUrl, input.linkType, input.requestedLocale, {
      allowedHosts: env.VIZAJE_DESTINATION_HOSTS,
      nodeEnv: env.NODE_ENV,
    })
    const resolved = await resolveLegacyTarget(submission)
    const fallback = resolved.targets[resolved.fallback.locale]
    if (!fallback.available) throw new Error("Legacy resolver fallback invariant failed")
    const fallbackUrl = new URL(fallback.url)
    destination = {
      targetProtocol: "https",
      targetHost: fallbackUrl.host.toLowerCase(),
      targetPath: resolved.fallback.path,
    }
    resolvedMetadata = {
      legacyEntityId: resolved.entity.id,
      legacyProductGuid: resolved.entity.type === "product" ? resolved.entity.sourceGuid : null,
      preferredLocale: resolved.requestedLocale,
      fallbackLocale: resolved.fallback.locale,
      fallbackPath: resolved.fallback.path,
      canonicalRuPath: resolved.targets.ru.available ? resolved.targets.ru.path : null,
      canonicalRoPath: resolved.targets.ro.available ? resolved.targets.ro.path : null,
      resolverVersion: resolved.contractVersion,
      resolvedAt: new Date(resolved.resolvedAt),
    }
  } else {
    // Keep the existing M4 URL validation and redirect snapshot intact until
    // the resolver-backed flow is explicitly enabled after Legacy is ready.
    destination = parseReferralDestination(input.targetUrl, input.linkType)
  }
  const now = new Date()
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
  if (expiresAt && expiresAt <= now) return { kind: "invalid_expiry" as const }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const rows = await getDb()
        .insert(referralLinks)
        .values({
          partnerId,
          code: generateReferralCode(),
          label: input.label ?? defaultLabel(input.linkType),
          ...destination,
          linkType: input.linkType,
          ...(resolvedMetadata ?? {}),
          status: "active",
          expiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      const link = rows[0]
      if (!link) throw new Error("Referral link creation failed")
      await getDb().insert(auditLogs).values({
        actorUserId,
        action: "REFERRAL_LINK_CREATED",
        entityType: "referral_link",
        entityId: link.id,
        metadata: { partnerId, creatorId: partner.creatorId, linkType: link.linkType, targetPath: link.targetPath },
        createdAt: now,
      })
      return { kind: "created" as const, link: serializeReferralLink(link) }
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      const code = error as { code?: string; cause?: { code?: string } }
      const isUniqueConflict = code.code === "23505" || code.cause?.code === "23505" || message.includes("referral_links_code_unique")
      if (!isUniqueConflict || attempt === 4) throw error
    }
  }

  throw new Error("Referral link creation failed")
}

function defaultLabel(type: ReferralLinkCreateInput["linkType"]) {
  return ({ homepage: "Главная", product: "Товар", category: "Категория", brand: "Бренд" } as const)[type]
}

export async function renameReferralLink(partnerId: string, linkId: string, input: ReferralLinkRenameInput, actorUserId: string) {
  const now = new Date()
  const rows = await getDb()
    .update(referralLinks)
    .set({ label: input.label, updatedAt: now })
    .where(and(eq(referralLinks.id, linkId), eq(referralLinks.partnerId, partnerId)))
    .returning()
  const link = rows[0]
  if (!link) return { kind: "not_found" as const }

  await getDb().insert(auditLogs).values({
    actorUserId,
    action: "REFERRAL_LINK_RENAMED",
    entityType: "referral_link",
    entityId: link.id,
    metadata: { partnerId, label: input.label },
    createdAt: now,
  })
  return { kind: "renamed" as const, link: serializeReferralLink(link) }
}

export async function revokeReferralLink(partnerId: string, linkId: string, actorUserId: string) {
  const existing = await getReferralLinkForPartner(partnerId, linkId)
  if (!existing) return { kind: "not_found" as const }
  if (existing.status === "revoked") return { kind: "already_revoked" as const, link: serializeReferralLink(existing) }

  const now = new Date()
  const rows = await getDb()
    .update(referralLinks)
    .set({ status: "revoked", revokedAt: now, updatedAt: now })
    .where(and(eq(referralLinks.id, linkId), eq(referralLinks.partnerId, partnerId), eq(referralLinks.status, "active")))
    .returning()
  const link = rows[0]
  if (!link) return { kind: "not_found" as const }

  await getDb().insert(auditLogs).values({
    actorUserId,
    action: "REFERRAL_LINK_REVOKED",
    entityType: "referral_link",
    entityId: link.id,
    metadata: { partnerId, code: link.code },
    createdAt: now,
  })
  return { kind: "revoked" as const, link: serializeReferralLink(link) }
}

export async function validateActiveReferralCode(code: string) {
  const result = await getActiveReferralLinkByCode(code)
  if (!result) return null
  return {
    ...serializeReferralLink(result.link),
    creatorId: result.creatorId,
  }
}
