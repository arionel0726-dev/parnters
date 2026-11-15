import { createHash } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import { auditLogs, getDb, legacyCreatorAccessGrants, partners } from "@vizaje/db"

export const legacyCreatorDashboardScopes = {
  accountStatus: "account:status",
  analyticsRead: "analytics:read",
  linksRead: "links:read",
  linksWrite: "links:write",
  accountUnlink: "account:unlink",
} as const

export type LegacyCreatorDashboardScope = typeof legacyCreatorDashboardScopes[keyof typeof legacyCreatorDashboardScopes]

export function hashLegacyCreatorGrant(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export async function getLegacyCreatorGrantState(input: { grantToken: string; legacyClientId: string }) {
  const rows = await getDb().select({ grant: legacyCreatorAccessGrants, partner: partners })
    .from(legacyCreatorAccessGrants)
    .innerJoin(partners, eq(legacyCreatorAccessGrants.partnerId, partners.id))
    .where(and(
      eq(legacyCreatorAccessGrants.tokenHash, hashLegacyCreatorGrant(input.grantToken)),
      eq(legacyCreatorAccessGrants.legacyClientId, input.legacyClientId),
      isNull(legacyCreatorAccessGrants.revokedAt),
    ))
    .limit(1)
  const row = rows[0]
  if (!row) return { kind: "invalid_grant" as const }
  if (!row.grant.scopes.includes(legacyCreatorDashboardScopes.accountStatus)) return { kind: "scope_required" as const }
  if (row.partner.type !== "creator" || !row.partner.creatorId) return { kind: "invalid_grant" as const }
  return {
    kind: "authorized" as const,
    partner: {
      partnerId: row.partner.id,
      creatorId: row.partner.creatorId,
      type: row.partner.type,
      status: row.partner.status,
    },
  }
}

export async function authorizeLegacyCreatorGrant(input: {
  grantToken: string
  legacyClientId: string
  scope: LegacyCreatorDashboardScope
}) {
  const rows = await getDb().select({ grant: legacyCreatorAccessGrants, partner: partners })
    .from(legacyCreatorAccessGrants)
    .innerJoin(partners, eq(legacyCreatorAccessGrants.partnerId, partners.id))
    .where(and(
      eq(legacyCreatorAccessGrants.tokenHash, hashLegacyCreatorGrant(input.grantToken)),
      eq(legacyCreatorAccessGrants.legacyClientId, input.legacyClientId),
      isNull(legacyCreatorAccessGrants.revokedAt),
    ))
    .limit(1)
  const row = rows[0]
  if (!row) return { kind: "invalid_grant" as const }
  if (row.partner.type !== "creator" || !row.partner.creatorId || row.partner.status !== "active") {
    return { kind: "partner_not_active" as const }
  }
  if (!row.grant.scopes.includes(input.scope)) return { kind: "scope_required" as const }
  return {
    kind: "authorized" as const,
    grantId: row.grant.id,
    partner: {
      id: row.partner.id,
      creatorId: row.partner.creatorId,
      type: row.partner.type,
      status: row.partner.status,
    },
  }
}

export async function revokeLegacyCreatorGrant(input: { grantToken: string; legacyClientId: string }) {
  const tokenHash = hashLegacyCreatorGrant(input.grantToken)
  const now = new Date()
  return getDb().transaction(async (tx) => {
    const rows = await tx.select().from(legacyCreatorAccessGrants).where(and(
      eq(legacyCreatorAccessGrants.tokenHash, tokenHash),
      eq(legacyCreatorAccessGrants.legacyClientId, input.legacyClientId),
    )).limit(1)
    const grant = rows[0]
    if (!grant || !grant.scopes.includes(legacyCreatorDashboardScopes.accountUnlink)) return { kind: "invalid_grant" as const }
    if (grant.revokedAt) return { kind: "already_unlinked" as const }

    const revoked = await tx.update(legacyCreatorAccessGrants)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(legacyCreatorAccessGrants.id, grant.id), isNull(legacyCreatorAccessGrants.revokedAt)))
      .returning({ id: legacyCreatorAccessGrants.id })
    if (!revoked[0]) return { kind: "already_unlinked" as const }
    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: "LEGACY_ACCOUNT_LINK_GRANT_REVOKED",
      entityType: "partner",
      entityId: grant.partnerId,
      metadata: { partnerId: grant.partnerId, source: "legacy_creator_dashboard" },
      createdAt: now,
    })
    return { kind: "unlinked" as const }
  })
}
