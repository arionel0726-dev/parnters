import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { legacyAccountLinkNonces, getDb } from "@vizaje/db"
import { and, eq, lt } from "drizzle-orm"
import type { MiddlewareHandler } from "hono"
import { z } from "zod"
import type { ApiEnv } from "../../auth/middleware"
import { getApiEnv } from "../../env"
import { apiError } from "../../http/errors"

const timestampSkewSeconds = 60
const nonceRetentionSeconds = 10 * 60

const keyRingSchema = z.array(z.object({
  keyId: z.string().regex(/^legacy-to-partners-[A-Za-z0-9._-]+$/),
  secret: z.string().min(43),
  active: z.boolean(),
}).strict()).min(1)

type ServiceKey = { keyId: string; secret: Buffer; active: boolean }

export function buildAccountLinkCanonicalString(input: {
  keyId: string
  method: string
  pathAndQuery: string
  timestamp: string
  nonce: string
  rawBody: string
}) {
  const bodyHash = createHash("sha256").update(Buffer.from(input.rawBody, "utf8")).digest("hex")
  return [
    "VP-HMAC-SHA256-V1",
    input.keyId,
    input.method.toUpperCase(),
    input.pathAndQuery,
    input.timestamp,
    input.nonce,
    bodyHash,
  ].join("\n")
}

function parseKeyRing(raw: string): ServiceKey[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const result = keyRingSchema.safeParse(parsed)
  if (!result.success || result.data.filter((key) => key.active).length !== 1) return null

  const keyIds = new Set<string>()
  const keys: ServiceKey[] = []
  for (const key of result.data) {
    const decoded = Buffer.from(key.secret, "base64url")
    if (
      !/^[A-Za-z0-9_-]+$/.test(key.secret) ||
      decoded.byteLength < 32 ||
      decoded.toString("base64url") !== key.secret ||
      keyIds.has(key.keyId)
    ) return null
    keyIds.add(key.keyId)
    keys.push({ keyId: key.keyId, secret: decoded, active: key.active })
  }
  return keys
}

export function hasLegacyToPartnersHmacConfiguration() {
  const rawKeyRing = getApiEnv().LEGACY_TO_PARTNERS_HMAC_KEYS
  return rawKeyRing ? parseKeyRing(rawKeyRing) !== null : false
}

function singleHeader(headers: Headers, name: string) {
  const value = headers.get(name)?.trim() ?? ""
  // Headers.get() joins duplicate values with commas. None of the protocol
  // fields can contain commas, so this rejects duplicate auth headers too.
  return value && !value.includes(",") ? value : null
}

function validSignature(expected: string, provided: string) {
  if (!/^[a-f0-9]{64}$/.test(provided)) return false
  const expectedBytes = Buffer.from(expected, "hex")
  const providedBytes = Buffer.from(provided, "hex")
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes)
}

async function reserveNonce(keyId: string, nonce: string, now: Date) {
  const db = getDb()
  await db.delete(legacyAccountLinkNonces).where(lt(legacyAccountLinkNonces.expiresAt, now))
  const rows = await db
    .insert(legacyAccountLinkNonces)
    .values({
      keyId,
      nonce,
      receivedAt: now,
      expiresAt: new Date(now.getTime() + nonceRetentionSeconds * 1000),
    })
    .onConflictDoNothing({ target: [legacyAccountLinkNonces.keyId, legacyAccountLinkNonces.nonce] })
    .returning({ id: legacyAccountLinkNonces.id })
  return Boolean(rows[0])
}

export const requireLegacyToPartnersHmac: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const rawKeyRing = getApiEnv().LEGACY_TO_PARTNERS_HMAC_KEYS
  const keys = rawKeyRing ? parseKeyRing(rawKeyRing) : null
  if (!keys) return apiError(c, 503, "ACCOUNT_LINKING_NOT_CONFIGURED", "Account linking is not configured.")

  const keyId = singleHeader(c.req.raw.headers, "x-vp-key-id")
  const timestamp = singleHeader(c.req.raw.headers, "x-vp-timestamp")
  const nonce = singleHeader(c.req.raw.headers, "x-vp-nonce")
  const signature = singleHeader(c.req.raw.headers, "x-vp-signature")
  if (
    !keyId || !timestamp || !nonce || !signature ||
    !/^\d+$/.test(timestamp) || !/^[A-Za-z0-9_-]{22}$/.test(nonce)
  ) return apiError(c, 401, "SERVICE_AUTH_INVALID", "Service authentication required.")

  const timestampSeconds = Number(timestamp)
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > timestampSkewSeconds) {
    return apiError(c, 401, "SERVICE_TIMESTAMP_INVALID", "Service timestamp is invalid.")
  }

  const key = keys.find((candidate) => candidate.keyId === keyId && candidate.active)
  if (!key) return apiError(c, 401, "SERVICE_AUTH_INVALID", "Service authentication required.")

  const rawBody = await c.req.raw.clone().text()
  const requestUrl = new URL(c.req.url)
  const canonical = buildAccountLinkCanonicalString({
    keyId,
    method: c.req.method,
    pathAndQuery: `${requestUrl.pathname}${requestUrl.search}`,
    timestamp,
    nonce,
    rawBody,
  })
  const expectedSignature = createHmac("sha256", key.secret).update(canonical, "utf8").digest("hex")
  if (!validSignature(expectedSignature, signature)) return apiError(c, 401, "SERVICE_AUTH_INVALID", "Service authentication required.")

  if (!await reserveNonce(keyId, nonce, new Date())) {
    return apiError(c, 409, "AUTH_NONCE_REPLAY", "Request nonce has already been used.")
  }

  await next()
}
