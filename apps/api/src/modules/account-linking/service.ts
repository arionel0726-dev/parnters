import { createHash, randomBytes } from "node:crypto"
import { auditLogs, getDb, legacyAccountLinkCodes, partners } from "@vizaje/db"
import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { getApiEnv } from "../../env"

export const ACCOUNT_LINK_CODE_TTL_MS = 5 * 60 * 1000

export type AccountLinkPartnerState = {
  partnerId: string
  creatorId: string
  type: "creator"
  status: "active" | "suspended" | "banned"
}

export function hashAccountLinkCode(code: string) {
  return createHash("sha256").update(code, "utf8").digest("hex")
}

export function verifyPkceS256(verifier: string, challenge: string) {
  const derived = createHash("sha256").update(verifier, "ascii").digest("base64url")
  return derived.length === challenge.length && derived === challenge
}

export function configuredAccountLinkRedirectUri() {
  const env = getApiEnv()
  const value = env.LEGACY_ACCOUNT_LINK_REDIRECT_URI
  if (!value) return null

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }

  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
  if (
    (parsed.protocol !== "https:" && !(env.NODE_ENV !== "production" && loopback && parsed.protocol === "http:")) ||
    parsed.username || parsed.password || parsed.hash
  ) return null

  return value
}

export async function issueAccountLinkCode(input: {
  partnerId: string
  legacyClientId: string
  redirectUri: string
  pkceChallenge: string
}) {
  const redirectUri = configuredAccountLinkRedirectUri()
  if (!redirectUri || input.redirectUri !== redirectUri) return { kind: "invalid_redirect" as const }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + ACCOUNT_LINK_CODE_TTL_MS)
  const db = getDb()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = randomBytes(32).toString("base64url")
    const rows = await db.insert(legacyAccountLinkCodes).values({
      codeHash: hashAccountLinkCode(code),
      partnerId: input.partnerId,
      legacyClientId: input.legacyClientId,
      redirectUri: input.redirectUri,
      pkceChallenge: input.pkceChallenge,
      createdAt: now,
      expiresAt,
    }).onConflictDoNothing({ target: legacyAccountLinkCodes.codeHash }).returning({ id: legacyAccountLinkCodes.id })
    if (rows[0]) return { kind: "issued" as const, code, expiresAt }
  }

  throw new Error("Account link code generation failed")
}

export async function exchangeAccountLinkCode(input: {
  code: string
  legacyClientId: string
  redirectUri: string
  codeVerifier: string
}): Promise<{ kind: "exchanged"; partner: AccountLinkPartnerState } | { kind: "invalid_code" } | { kind: "partner_not_active" }> {
  const now = new Date()
  const codeHash = hashAccountLinkCode(input.code)

  return getDb().transaction(async (tx) => {
    const codeRows = await tx.select().from(legacyAccountLinkCodes).where(eq(legacyAccountLinkCodes.codeHash, codeHash)).limit(1)
    const stored = codeRows[0]
    if (
      !stored || stored.consumedAt || stored.expiresAt <= now ||
      !stored.legacyClientId || stored.legacyClientId !== input.legacyClientId ||
      stored.redirectUri !== input.redirectUri || !verifyPkceS256(input.codeVerifier, stored.pkceChallenge)
    ) return { kind: "invalid_code" as const }

    // Status changes use the same advisory lock, so exchange and moderation
    // cannot make contradictory decisions about the same creator.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${stored.partnerId}))`)
    const partnerRows = await tx.select({ id: partners.id, creatorId: partners.creatorId, type: partners.type, status: partners.status }).from(partners).where(eq(partners.id, stored.partnerId)).limit(1)
    const partner = partnerRows[0]
    if (!partner || partner.type !== "creator" || !partner.creatorId) return { kind: "invalid_code" as const }

    const consumed = await tx.update(legacyAccountLinkCodes)
      .set({ consumedAt: now, legacyClientId: null })
      .where(and(eq(legacyAccountLinkCodes.id, stored.id), isNull(legacyAccountLinkCodes.consumedAt), gt(legacyAccountLinkCodes.expiresAt, now)))
      .returning({ id: legacyAccountLinkCodes.id })
    if (!consumed[0]) return { kind: "invalid_code" as const }

    if (partner.status !== "active") return { kind: "partner_not_active" as const }

    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: "LEGACY_ACCOUNT_LINK_CODE_EXCHANGED",
      entityType: "partner",
      entityId: partner.id,
      metadata: { partnerId: partner.id, creatorId: partner.creatorId },
      createdAt: now,
    })

    return {
      kind: "exchanged" as const,
      partner: {
        partnerId: partner.id,
        creatorId: partner.creatorId,
        type: "creator" as const,
        status: partner.status,
      },
    }
  })
}

export async function getPartnerAccountLinkState(partnerId: string): Promise<AccountLinkPartnerState | null> {
  const rows = await getDb().select({ id: partners.id, creatorId: partners.creatorId, type: partners.type, status: partners.status }).from(partners).where(eq(partners.id, partnerId)).limit(1)
  const partner = rows[0]
  if (!partner || partner.type !== "creator" || !partner.creatorId) return null
  return {
    partnerId: partner.id,
    creatorId: partner.creatorId,
    type: "creator",
    status: partner.status,
  }
}
