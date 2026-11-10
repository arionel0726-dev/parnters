import { createHash, randomBytes } from "node:crypto"
import { auditLogs, getDb, legacyAccountLinkCodes, legacyAccountLinkInitiations, partners } from "@vizaje/db"
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm"
import { getApiEnv } from "../../env"

export const ACCOUNT_LINK_INITIATION_TTL_MS = 5 * 60 * 1000
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

export function hashAccountLinkTicket(ticket: string) {
  return createHash("sha256").update(ticket, "utf8").digest("hex")
}

export function hashAccountLinkState(state: string) {
  return createHash("sha256").update(state, "utf8").digest("hex")
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
    parsed.username || parsed.password || parsed.hash || parsed.search ||
    parsed.pathname !== "/account/creator-link/callback"
  ) return null

  return value
}

function configuredAuthorizeUrl(ticket: string) {
  let appUrl: URL
  try {
    appUrl = new URL(getApiEnv().WEB_APP_URL)
  } catch {
    return null
  }
  if (!["http:", "https:"].includes(appUrl.protocol) || appUrl.username || appUrl.password || appUrl.hash) return null

  appUrl.pathname = "/link/legacy/authorize"
  appUrl.search = ""
  appUrl.searchParams.set("ticket", ticket)
  return appUrl.toString()
}

function isValidInitiation(row: typeof legacyAccountLinkInitiations.$inferSelect | undefined, now: Date) {
  return Boolean(
    row &&
    !row.consumedAt &&
    Boolean(row.legacyClientId) &&
    row.expiresAt > now &&
    configuredAccountLinkRedirectUri() === row.redirectUri &&
    hashAccountLinkState(row.state) === row.stateHash,
  )
}

export async function issueAccountLinkInitiation(input: {
  legacyClientId: string
  redirectUri: string
  pkceChallenge: string
  state: string
}) {
  const redirectUri = configuredAccountLinkRedirectUri()
  if (!redirectUri || input.redirectUri !== redirectUri) return { kind: "invalid_redirect" as const }

  const authorizeUrlBase = configuredAuthorizeUrl("ticket")
  if (!authorizeUrlBase) return { kind: "invalid_configuration" as const }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + ACCOUNT_LINK_INITIATION_TTL_MS)
  const db = getDb()
  await db.delete(legacyAccountLinkInitiations).where(lt(legacyAccountLinkInitiations.expiresAt, now))

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ticket = randomBytes(32).toString("base64url")
    const rows = await db.insert(legacyAccountLinkInitiations).values({
      ticketHash: hashAccountLinkTicket(ticket),
      legacyClientId: input.legacyClientId,
      redirectUri: input.redirectUri,
      pkceChallenge: input.pkceChallenge,
      state: input.state,
      stateHash: hashAccountLinkState(input.state),
      createdAt: now,
      expiresAt,
    }).onConflictDoNothing({ target: legacyAccountLinkInitiations.ticketHash }).returning({ id: legacyAccountLinkInitiations.id })
    if (rows[0]) {
      const authorizeUrl = new URL(authorizeUrlBase)
      authorizeUrl.searchParams.set("ticket", ticket)
      return { kind: "issued" as const, ticket, authorizeUrl: authorizeUrl.toString(), expiresAt }
    }
  }

  throw new Error("Account link initiation ticket generation failed")
}

export async function inspectAccountLinkInitiation(ticket: string) {
  const rows = await getDb().select().from(legacyAccountLinkInitiations).where(eq(legacyAccountLinkInitiations.ticketHash, hashAccountLinkTicket(ticket))).limit(1)
  if (!isValidInitiation(rows[0], new Date())) return { kind: "invalid_ticket" as const }
  return { kind: "valid" as const, expiresAt: rows[0]!.expiresAt }
}

export async function confirmAccountLinkInitiation(input: { ticket: string; partnerId: string }): Promise<
  { kind: "confirmed"; callbackUrl: string; expiresAt: Date } |
  { kind: "invalid_ticket" } |
  { kind: "partner_not_active" } |
  { kind: "invalid_configuration" }
> {
  const redirectUri = configuredAccountLinkRedirectUri()
  if (!redirectUri) return { kind: "invalid_configuration" }

  const now = new Date()
  const ticketHash = hashAccountLinkTicket(input.ticket)

  return getDb().transaction(async (tx) => {
    const firstRows = await tx.select().from(legacyAccountLinkInitiations).where(eq(legacyAccountLinkInitiations.ticketHash, ticketHash)).limit(1)
    const first = firstRows[0]
    if (!isValidInitiation(first, now)) return { kind: "invalid_ticket" as const }

    // Keep confirmation and moderation status changes serialized for one creator.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.partnerId}))`)
    const partnerRows = await tx.select({ id: partners.id, creatorId: partners.creatorId, type: partners.type, status: partners.status }).from(partners).where(eq(partners.id, input.partnerId)).limit(1)
    const partner = partnerRows[0]
    if (!partner || partner.type !== "creator" || !partner.creatorId) return { kind: "invalid_ticket" as const }
    if (partner.status !== "active") return { kind: "partner_not_active" as const }

    const currentRows = await tx.select().from(legacyAccountLinkInitiations).where(eq(legacyAccountLinkInitiations.ticketHash, ticketHash)).limit(1)
    const current = currentRows[0]
    if (!isValidInitiation(current, now) || !current?.legacyClientId) return { kind: "invalid_ticket" as const }

    const consumed = await tx.update(legacyAccountLinkInitiations)
      .set({ consumedAt: now, legacyClientId: null })
      .where(and(eq(legacyAccountLinkInitiations.id, current.id), isNull(legacyAccountLinkInitiations.consumedAt), gt(legacyAccountLinkInitiations.expiresAt, now)))
      .returning({ id: legacyAccountLinkInitiations.id })
    if (!consumed[0]) return { kind: "invalid_ticket" as const }

    const code = randomBytes(32).toString("base64url")
    const codeExpiresAt = new Date(Math.min(current.expiresAt.getTime(), now.getTime() + ACCOUNT_LINK_CODE_TTL_MS))
    await tx.insert(legacyAccountLinkCodes).values({
      codeHash: hashAccountLinkCode(code),
      partnerId: partner.id,
      legacyClientId: current.legacyClientId,
      redirectUri: current.redirectUri,
      pkceChallenge: current.pkceChallenge,
      createdAt: now,
      expiresAt: codeExpiresAt,
    })

    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: "LEGACY_ACCOUNT_LINK_AUTHORIZATION_CONFIRMED",
      entityType: "partner",
      entityId: partner.id,
      metadata: { partnerId: partner.id, creatorId: partner.creatorId },
      createdAt: now,
    })

    const callbackUrl = new URL(current.redirectUri)
    callbackUrl.searchParams.set("code", code)
    callbackUrl.searchParams.set("state", current.state)
    return { kind: "confirmed" as const, callbackUrl: callbackUrl.toString(), expiresAt: codeExpiresAt }
  })
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
