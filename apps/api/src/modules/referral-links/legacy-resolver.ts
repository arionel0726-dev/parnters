import { createHash, createHmac, randomBytes } from "node:crypto"
import { Agent, fetch as undiciFetch } from "undici"
import { z } from "zod"

const resolverPath = "/internal/v1/referrals/resolve-target"
const maximumBodyBytes = 16 * 1024
const attemptTimeoutMs = 2_000
const connectTimeoutMs = 500
const maximumAttempts = 2
const retryDelayMs = 150
const callerDeadlineMs = 5_000

const localeTargetSchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true), url: z.string().url(), path: z.string().min(1) }).strict(),
  z.object({ available: z.literal(false), url: z.null(), path: z.null() }).strict(),
])

const entitySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("homepage"), id: z.literal("main") }).strict(),
  z.object({ type: z.literal("product"), id: z.string().regex(/^\d+$/), sourceGuid: z.string().nullable() }).strict(),
  z.object({ type: z.literal("category"), id: z.string().regex(/^\d+$/) }).strict(),
  z.object({ type: z.literal("brand"), id: z.string().regex(/^\d+$/) }).strict(),
])

const resolveTargetResponseSchema = z.object({
  contractVersion: z.literal(1),
  entity: entitySchema,
  requestedLocale: z.enum(["ru", "ro"]),
  targets: z.object({ ru: localeTargetSchema, ro: localeTargetSchema }).strict(),
  fallback: z.object({ locale: z.enum(["ru", "ro"]), path: z.string().min(1) }).strict(),
  resolvedAt: z.iso.datetime(),
}).strict()

const resolverErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "INVALID_TARGET", "METHOD_NOT_ALLOWED", "HOST_NOT_ALLOWED", "TYPE_MISMATCH",
      "LOCALE_MISMATCH", "AMBIGUOUS_TARGET", "ENTITY_NOT_FOUND", "ENTITY_UNAVAILABLE",
      "UNSUPPORTED_ROUTE", "LOCALE_UNAVAILABLE", "RATE_LIMITED", "LEGACY_TEMPORARILY_UNAVAILABLE",
      "SERVICE_AUTH_INVALID", "SERVICE_TIMESTAMP_INVALID", "AUTH_NONCE_REPLAY",
    ]),
    message: z.string(),
    retryable: z.boolean(),
    requestId: z.string().min(1),
  }).strict(),
}).strict()

const keyRingSchema = z.array(z.object({
  keyId: z.string().regex(/^partners-to-legacy-[A-Za-z0-9._-]+$/),
  secret: z.string().min(1),
  active: z.boolean(),
}).strict()).min(1)

export type ResolverLocale = "ru" | "ro"
export type ResolverEntityType = "homepage" | "product" | "category" | "brand"
export type ResolveTargetInput = {
  target: string
  expectedType: ResolverEntityType
  requestedLocale: ResolverLocale
}
export type ResolveTargetResponse = z.infer<typeof resolveTargetResponseSchema>

export class LegacyResolverConfigurationError extends Error {
  constructor() {
    super("Legacy resolver is not configured safely.")
    this.name = "LegacyResolverConfigurationError"
  }
}

export class LegacyResolverUnavailableError extends Error {
  readonly code = "LEGACY_TEMPORARILY_UNAVAILABLE"

  constructor() {
    super("Legacy resolver is temporarily unavailable.")
    this.name = "LegacyResolverUnavailableError"
  }
}

export class LegacyResolverInvalidResponseError extends Error {
  readonly code = "LEGACY_RESOLVER_INVALID_RESPONSE"

  constructor() {
    super("Legacy resolver returned an invalid response.")
    this.name = "LegacyResolverInvalidResponseError"
  }
}

export class LegacyResolverRejectedError extends Error {
  constructor(readonly code: string, readonly status: number, readonly retryable: boolean) {
    super("Legacy resolver rejected the destination.")
    this.name = "LegacyResolverRejectedError"
  }
}

type ResolverKey = { keyId: string; secret: Buffer; active: boolean }
type ResolverHttpResponse = { status: number; headers: { get(name: string): string | null }; bodyText: string }
export type ResolverTransport = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal },
  timeouts: { connectTimeoutMs: number; totalTimeoutMs: number },
) => Promise<ResolverHttpResponse>

export type LegacyResolverClientOptions = {
  baseUrl: string
  hmacKeysJson: string
  allowedHosts: string[]
  nodeEnv?: string
  transport?: ResolverTransport
  now?: () => number
  nonce?: () => string
  sleep?: (ms: number) => Promise<void>
}

export function buildResolverCanonicalString(input: {
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

export function signResolverRequest(secret: Uint8Array, canonicalString: string) {
  return createHmac("sha256", secret).update(canonicalString, "utf8").digest("hex")
}

function parseKeyRing(raw: string): ResolverKey[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new LegacyResolverConfigurationError()
  }
  const result = keyRingSchema.safeParse(parsed)
  if (!result.success) throw new LegacyResolverConfigurationError()
  const keyIds = new Set<string>()
  const activeKeys = result.data.filter((key) => key.active)
  if (activeKeys.length !== 1) throw new LegacyResolverConfigurationError()
  return result.data.map(({ keyId, secret, active }) => {
    const decoded = Buffer.from(secret, "base64url")
    if (secret.length < 43 || !/^[A-Za-z0-9_-]+$/.test(secret) || decoded.toString("base64url") !== secret || decoded.byteLength < 32 || keyIds.has(keyId)) {
      throw new LegacyResolverConfigurationError()
    }
    keyIds.add(keyId)
    return { keyId, secret: decoded, active }
  })
}

function parseBaseUrl(value: string, nodeEnv: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new LegacyResolverConfigurationError()
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (
    (url.protocol !== "https:" && !(nodeEnv !== "production" && loopback && url.protocol === "http:")) ||
    url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")
  ) throw new LegacyResolverConfigurationError()
  return url.origin
}

function hasLocalePrefix(path: string, locale: ResolverLocale) {
  return path === `/${locale}` || path.startsWith(`/${locale}/`)
}

function validateCanonicalPath(path: string, locale: ResolverLocale, type: ResolverEntityType) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("?") || path.includes("#") || /%2f|%5c/i.test(path)) return false
  if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(path) || /%2e/i.test(path)) return false
  if (type === "homepage") return path === "/" || path === `/${locale}` || path === `/${locale}/`
  if (type === "brand") return new RegExp(`^/${locale}/brands/[^/]+/?$`).test(path)
  if (!hasLocalePrefix(path, locale)) return false
  const localized = path.slice(locale.length + 2)
  if (type === "category") return /^(?:(?:catalog|katalog)\/)?categories?\/[^/]+(?:\/[^/]+)*\/?$/.test(localized)
    || /^(?:catalog|katalog)\/[^/]+(?:\/[^/]+)*\/?$/.test(localized)
  if (type === "product") {
    return /^(?:(?:(?:catalog|katalog)\/)?products?\/[^/]+(?:\/[^/]+)*|(?:catalog|katalog)\/[^/]+\/[^/]+(?:\/[^/]+)*)\/?$/.test(localized)
  }
  return false
}

function validateResponseSemantics(
  value: ResolveTargetResponse,
  input: ResolveTargetInput,
  allowedHosts: Set<string>,
) {
  if (value.entity.type !== input.expectedType || value.requestedLocale !== input.requestedLocale) return false
  const availableLocales = (Object.keys(value.targets) as ResolverLocale[]).filter((locale) => value.targets[locale].available)
  if (availableLocales.length === 0 || !availableLocales.includes(value.fallback.locale)) return false
  const selected = value.targets[value.fallback.locale]
  if (!selected.available || selected.path !== value.fallback.path) return false
  const expectedFallbackLocale = value.targets[input.requestedLocale].available
    ? input.requestedLocale
    : input.requestedLocale === "ru" ? "ro" : "ru"
  if (value.fallback.locale !== expectedFallbackLocale) return false

  // Legacy uses one shared brand URI, while the locale prefix differs. Reject
  // inconsistent snapshots rather than persisting two unrelated brand pages.
  if (input.expectedType === "brand" && value.targets.ru.available && value.targets.ro.available) {
    const ruUri = value.targets.ru.path.match(/^\/ru\/brands\/([^/]+)\/?$/)?.[1]
    const roUri = value.targets.ro.path.match(/^\/ro\/brands\/([^/]+)\/?$/)?.[1]
    if (!ruUri || !roUri || ruUri !== roUri) return false
  }

  for (const locale of ["ru", "ro"] as const) {
    const target = value.targets[locale]
    if (!target.available) continue
    if (!validateCanonicalPath(target.path, locale, input.expectedType)) return false
    let url: URL
    try {
      url = new URL(target.url)
    } catch {
      return false
    }
    if (
      url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      (url.port && url.port !== "443") || !allowedHosts.has(url.host.toLowerCase()) ||
      url.pathname !== target.path
    ) return false
  }
  return true
}

function rawPathIsSafe(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") &&
    !/%(?:2f|5c|2e)/i.test(path) && !/(?:^|\/)\.{1,2}(?:\/|$)/.test(path)
}

/** Locally validates creator input without deriving or guessing the Legacy entity ID. */
export function parseResolverSubmission(
  targetValue: string,
  expectedType: ResolverEntityType,
  requestedLocale?: ResolverLocale,
  options: { allowedHosts?: string[]; nodeEnv?: string } = {},
): ResolveTargetInput {
  const target = targetValue.trim()
  if (!target || target.length > 2048 || /[\s?#]/.test(target) || target.includes("\\")) {
    throw new LegacyResolverRejectedError("INVALID_TARGET", 400, false)
  }

  let path: string
  let urlLocaleHint: ResolverLocale | undefined
  if (target.startsWith("/")) {
    if (!rawPathIsSafe(target)) throw new LegacyResolverRejectedError("INVALID_TARGET", 400, false)
    path = target
  } else {
    let url: URL
    try {
      url = new URL(target)
    } catch {
      throw new LegacyResolverRejectedError("INVALID_TARGET", 400, false)
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    const allowedHosts = new Set((options.allowedHosts ?? []).map((host) => host.toLowerCase()))
    if (
      (url.protocol !== "https:" && !(options.nodeEnv !== "production" && loopback && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash || (url.port && url.port !== "443" && !(loopback && options.nodeEnv !== "production")) ||
      !allowedHosts.has(url.host.toLowerCase())
    ) throw new LegacyResolverRejectedError("HOST_NOT_ALLOWED", 400, false)
    path = url.pathname || "/"
    if (!rawPathIsSafe(path)) throw new LegacyResolverRejectedError("INVALID_TARGET", 400, false)
  }

  const localeMatch = path.match(/^\/(ru|ro)(?:\/|$)/)
  if (localeMatch) urlLocaleHint = localeMatch[1] as ResolverLocale
  if (!urlLocaleHint && expectedType !== "homepage") {
    throw new LegacyResolverRejectedError("UNSUPPORTED_ROUTE", 422, false)
  }
  if (!urlLocaleHint && expectedType === "homepage" && path !== "/") {
    throw new LegacyResolverRejectedError("UNSUPPORTED_ROUTE", 422, false)
  }

  const locale = requestedLocale ?? urlLocaleHint ?? "ru"
  if (urlLocaleHint && urlLocaleHint !== locale && expectedType !== "brand") {
    throw new LegacyResolverRejectedError("LOCALE_MISMATCH", 409, false)
  }
  if (!validateCanonicalPath(path, urlLocaleHint ?? locale, expectedType)) {
    throw new LegacyResolverRejectedError("INVALID_TARGET", 400, false)
  }
  return { target: path, expectedType, requestedLocale: locale }
}

function validateOutgoingTarget(input: ResolveTargetInput) {
  if (
    !rawPathIsSafe(input.target) ||
    !validateCanonicalPath(input.target, input.requestedLocale, input.expectedType) &&
      !(input.expectedType === "brand" && /^\/(?:ru|ro)\/brands\/[^/]+\/?$/.test(input.target))
  ) throw new LegacyResolverRejectedError("INVALID_TARGET", 400, false)
  // The client deliberately sends only a validated relative path. Legacy owns the
  // canonical origin and entity lookup; a client-supplied host cannot redirect it.
}

async function defaultTransport(
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal },
  timeouts: { connectTimeoutMs: number; totalTimeoutMs: number },
): Promise<ResolverHttpResponse> {
  const dispatcher = new Agent({
    connect: { timeout: timeouts.connectTimeoutMs },
    headersTimeout: timeouts.totalTimeoutMs,
    bodyTimeout: timeouts.totalTimeoutMs,
  })
  try {
    const response = await undiciFetch(url, {
      ...init,
      dispatcher,
      redirect: "error",
    })
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maximumBodyBytes) {
          await reader.cancel()
          throw new LegacyResolverInvalidResponseError()
        }
        chunks.push(value)
      }
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    let bodyText: string
    try {
      bodyText = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
      throw new LegacyResolverInvalidResponseError()
    }
    return { status: response.status, headers: response.headers, bodyText }
  } finally {
    await dispatcher.close().catch(() => undefined)
  }
}

function retryAfterMs(headers: { get(name: string): string | null }) {
  const value = headers.get("retry-after")
  if (!value || !/^\d+$/.test(value.trim())) return retryDelayMs
  return Math.min(Number(value) * 1_000, 1_000)
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504
}

function parseErrorResponse(response: ResolverHttpResponse): { code: string; retryable: boolean } {
  if (Buffer.byteLength(response.bodyText, "utf8") > maximumBodyBytes) throw new LegacyResolverInvalidResponseError()
  let parsed: unknown
  try {
    parsed = JSON.parse(response.bodyText)
  } catch {
    throw new LegacyResolverInvalidResponseError()
  }
  const result = resolverErrorSchema.safeParse(parsed)
  if (!result.success) throw new LegacyResolverInvalidResponseError()
  return { code: result.data.error.code, retryable: result.data.error.retryable }
}

export function createLegacyResolverClient(options: LegacyResolverClientOptions) {
  const baseUrl = parseBaseUrl(options.baseUrl, options.nodeEnv ?? "development")
  const keys = parseKeyRing(options.hmacKeysJson)
  const allowedHosts = new Set(options.allowedHosts.map((host) => host.toLowerCase()))
  const transport = options.transport ?? defaultTransport
  const now = options.now ?? Date.now
  const nonce = options.nonce ?? (() => randomBytes(16).toString("base64url"))
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))

  return {
    async resolve(input: ResolveTargetInput): Promise<ResolveTargetResponse> {
      validateOutgoingTarget(input)
      const rawBody = JSON.stringify(input)
      if (Buffer.byteLength(rawBody, "utf8") > maximumBodyBytes) throw new LegacyResolverRejectedError("INVALID_TARGET", 400, false)
      const key = keys.find((candidate) => candidate.active)!
      const url = `${baseUrl}${resolverPath}`
      const deadline = now() + callerDeadlineMs

      const usedNonces = new Set<string>()
      let lastTimestamp = 0
      for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
        const remainingMs = deadline - now()
        if (remainingMs <= 0) throw new LegacyResolverUnavailableError()
        // Retries can happen in the same wall-clock second. Keep timestamps
        // strictly fresh as required by the Legacy replay guard.
        const timestampValue = Math.max(Math.floor(now() / 1_000), lastTimestamp + 1)
        lastTimestamp = timestampValue
        const timestamp = String(timestampValue)
        const requestNonce = nonce()
        if (!/^[A-Za-z0-9_-]{22}$/.test(requestNonce) || usedNonces.has(requestNonce)) throw new LegacyResolverConfigurationError()
        usedNonces.add(requestNonce)
        const canonicalString = buildResolverCanonicalString({
          keyId: key.keyId,
          method: "POST",
          pathAndQuery: resolverPath,
          timestamp,
          nonce: requestNonce,
          rawBody,
        })
        const headers = {
          "content-type": "application/json; charset=utf-8",
          "x-vp-key-id": key.keyId,
          "x-vp-timestamp": timestamp,
          "x-vp-nonce": requestNonce,
          "x-vp-signature": signResolverRequest(key.secret, canonicalString),
        }
        const attemptMs = Math.min(attemptTimeoutMs, remainingMs)
        let response: ResolverHttpResponse
        try {
          response = await transport(url, {
            method: "POST",
            headers,
            body: rawBody,
            signal: AbortSignal.timeout(attemptMs),
          }, { connectTimeoutMs, totalTimeoutMs: attemptMs })
        } catch (error) {
          if (error instanceof LegacyResolverInvalidResponseError) throw error
          if (attempt === maximumAttempts || now() >= deadline) throw new LegacyResolverUnavailableError()
          const delay = Math.min(retryDelayMs, Math.max(0, deadline - now()))
          await sleep(delay)
          continue
        }

        if (response.status === 200) {
          if (Buffer.byteLength(response.bodyText, "utf8") > maximumBodyBytes) throw new LegacyResolverInvalidResponseError()
          let parsed: unknown
          try {
            parsed = JSON.parse(response.bodyText)
          } catch {
            throw new LegacyResolverInvalidResponseError()
          }
          const result = resolveTargetResponseSchema.safeParse(parsed)
          if (!result.success || !validateResponseSemantics(result.data, input, allowedHosts)) throw new LegacyResolverInvalidResponseError()
          return result.data
        }

        if (isRetryableStatus(response.status)) {
          const error = parseErrorResponse(response)
          if (!error.retryable) throw new LegacyResolverRejectedError(error.code, response.status, false)
          if (attempt === maximumAttempts || now() >= deadline) throw new LegacyResolverUnavailableError()
          await sleep(Math.min(response.status === 429 ? retryAfterMs(response.headers) : retryDelayMs, Math.max(0, deadline - now())))
          continue
        }

        const error = parseErrorResponse(response)
        throw new LegacyResolverRejectedError(error.code, response.status, error.retryable)
      }

      throw new LegacyResolverUnavailableError()
    },
  }
}

export async function resolveLegacyTarget(input: ResolveTargetInput): Promise<ResolveTargetResponse> {
  const { getApiEnv } = await import("../../env")
  const env = getApiEnv()
  if (!env.LEGACY_INTERNAL_BASE_URL || !env.LEGACY_RESOLVER_HMAC_KEYS) throw new LegacyResolverConfigurationError()
  return createLegacyResolverClient({
    baseUrl: env.LEGACY_INTERNAL_BASE_URL,
    hmacKeysJson: env.LEGACY_RESOLVER_HMAC_KEYS,
    allowedHosts: env.VIZAJE_DESTINATION_HOSTS,
    nodeEnv: env.NODE_ENV,
  }).resolve(input)
}
