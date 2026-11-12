import { createHash, createHmac } from "node:crypto"
import { createServer } from "node:net"
import { describe, expect, test } from "bun:test"
import {
  buildResolverCanonicalString,
  createLegacyResolverClient,
  LegacyResolverConfigurationError,
  LegacyResolverInvalidResponseError,
  LegacyResolverRejectedError,
  LegacyResolverUnavailableError,
  parseResolverSubmission,
  type ResolveTargetResponse,
  type ResolverTransport,
} from "../src/modules/referral-links/legacy-resolver"

const secretBytes = Buffer.alloc(32, 0x5a)
const secret = secretBytes.toString("base64url")
const keyId = "partners-to-legacy-test-1"
const allowedHosts = ["vizaje-nica.com", "www.vizaje-nica.com"]
const baseUrl = "https://legacy.internal"
const signingPath = "/internal/v1/referrals/resolve-target"

function productResponse(requestedLocale: "ru" | "ro" = "ro"): ResolveTargetResponse {
  return {
    contractVersion: 1,
    entity: { type: "product", id: "12345", sourceGuid: "source-guid-1" },
    requestedLocale,
    targets: {
      ru: { available: true, url: "https://vizaje-nica.com/ru/katalog/paletki/39897", path: "/ru/katalog/paletki/39897" },
      ro: { available: true, url: "https://vizaje-nica.com/ro/catalog/paletki/39897", path: "/ro/catalog/paletki/39897" },
    },
    fallback: {
      locale: requestedLocale,
      path: requestedLocale === "ru" ? "/ru/katalog/paletki/39897" : "/ro/catalog/paletki/39897",
    },
    resolvedAt: "2026-11-04T08:00:00.000Z",
  }
}

function brandResponse(requestedLocale: "ru" | "ro" = "ro", uri = "chanel", roUri = uri) {
  return {
    contractVersion: 1,
    entity: { type: "brand", id: "77" },
    requestedLocale,
    targets: {
      ru: { available: true, url: `https://vizaje-nica.com/ru/katalog/${uri}`, path: `/ru/katalog/${uri}` },
      ro: { available: true, url: `https://vizaje-nica.com/ro/catalog/${roUri}`, path: `/ro/catalog/${roUri}` },
    },
    fallback: { locale: requestedLocale, path: requestedLocale === "ro" ? `/ro/catalog/${roUri}` : `/ru/katalog/${uri}` },
    resolvedAt: "2026-11-04T08:00:00.000Z",
  }
}

function categoryResponse(requestedLocale: "ru" | "ro" = "ro", ruUri = "paletki", roUri = ruUri) {
  return {
    contractVersion: 1,
    entity: { type: "category", id: "42" },
    requestedLocale,
    targets: {
      ru: { available: true, url: `https://vizaje-nica.com/ru/katalog/${ruUri}`, path: `/ru/katalog/${ruUri}` },
      ro: { available: true, url: `https://vizaje-nica.com/ro/catalog/${roUri}`, path: `/ro/catalog/${roUri}` },
    },
    fallback: { locale: requestedLocale, path: requestedLocale === "ro" ? `/ro/catalog/${roUri}` : `/ru/katalog/${ruUri}` },
    resolvedAt: "2026-11-04T08:00:00.000Z",
  }
}

function response(status: number, body: unknown, headers = new Headers()): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

async function getFreeLocalPort() {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()
      if (!address || typeof address === "string") {
        probe.close()
        reject(new Error("Unable to determine a free local port"))
        return
      }
      probe.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

function makeClient(transport: ResolverTransport, overrides: Partial<Parameters<typeof createLegacyResolverClient>[0]> = {}) {
  return createLegacyResolverClient({
    baseUrl,
    hmacKeysJson: JSON.stringify([{ keyId, secret, active: true }]),
    allowedHosts,
    nodeEnv: "production",
    transport,
    ...overrides,
  })
}

function expectSignedRequest(
  url: string,
  init: Parameters<ResolverTransport>[1],
  expectedBody?: Record<string, unknown>,
) {
  expect(url).toBe(`${baseUrl}${signingPath}`)
  expect(init.method).toBe("POST")
  expect(init.headers["content-type"]).toBe("application/json; charset=utf-8")
  expect(init.headers["user-agent"]).toBe("VizajePartners-LegacyResolver/1.0")
  expect(init.headers["x-vp-key-id"]).toBe(keyId)
  const canonical = buildResolverCanonicalString({
    keyId,
    method: init.method,
    pathAndQuery: signingPath,
    timestamp: init.headers["x-vp-timestamp"]!,
    nonce: init.headers["x-vp-nonce"]!,
    rawBody: init.body,
  })
  const signature = createHmac("sha256", secretBytes).update(canonical, "utf8").digest("hex")
  expect(init.headers["x-vp-signature"]).toBe(signature)
  if (expectedBody) expect(JSON.parse(init.body)).toEqual(expectedBody)
}

describe("Legacy resolver client (M5.1 v1)", () => {
  test("signs the exact raw JSON body using the v1 canonical string", () => {
    const rawBody = '{"target":"/ro/catalog/paletki/39897","expectedType":"product","requestedLocale":"ro"}'
    const bodyHash = createHash("sha256").update(Buffer.from(rawBody, "utf8")).digest("hex")
    const canonical = buildResolverCanonicalString({
      keyId,
      method: "post",
      pathAndQuery: signingPath,
      timestamp: "1793779200",
      nonce: "AAAAAAAAAAAAAAAAAAAAAA",
      rawBody,
    })
    expect(canonical).toBe([
      "VP-HMAC-SHA256-V1", keyId, "POST", signingPath, "1793779200",
      "AAAAAAAAAAAAAAAAAAAAAA", bodyHash,
    ].join("\n"))
  })

  test.each([
    ["ru", "https://vizaje-nica.com/ru/katalog/paletki/39897", "/ru/katalog/paletki/39897"],
    ["ro", "https://vizaje-nica.com/ro/catalog/paletki/39897", "/ro/catalog/paletki/39897"],
  ] as const)("resolves the %s product URL without treating its final URI as an ID", async (locale, submittedUrl, path) => {
    const input = parseResolverSubmission(submittedUrl, "product", locale, { allowedHosts, nodeEnv: "production" })
    expect(input).toEqual({ target: path, expectedType: "product", requestedLocale: locale })
    let calls = 0
    const client = makeClient(async (url, init) => {
      calls += 1
      expectSignedRequest(url, init, input)
      return { status: 200, headers: new Headers(), bodyText: JSON.stringify(productResponse(locale)) }
    })
    const resolved = await client.resolve(input)
    expect(calls).toBe(1)
    expect(resolved.entity).toEqual({ type: "product", id: "12345", sourceGuid: "source-guid-1" })
    expect(resolved.targets.ru.path).not.toBe(resolved.targets.ro.path)
    expect(resolved.fallback.path).toBe(path)
  })

  test("uses Bun's Undici dispatcher and sends an explicit resolver User-Agent", async () => {
    let userAgent: string | null = null
    const port = await getFreeLocalPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch(request) {
        userAgent = request.headers.get("user-agent")
        return new Response(JSON.stringify(productResponse("ro")), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      },
    })

    try {
      const client = createLegacyResolverClient({
        baseUrl: `http://127.0.0.1:${server.port}`,
        hmacKeysJson: JSON.stringify([{ keyId, secret, active: true }]),
        allowedHosts,
        nodeEnv: "development",
      })
      const result = await client.resolve({ target: "/ro/catalog/paletki/39897", expectedType: "product", requestedLocale: "ro" })
      expect(result.entity).toEqual({ type: "product", id: "12345", sourceGuid: "source-guid-1" })
      expect(userAgent as unknown).toBe("VizajePartners-LegacyResolver/1.0")
    } finally {
      server.stop()
    }
  })

  test("accepts a shared brand URI with either locale prefix and preserves the requested locale", () => {
    const fromRu = parseResolverSubmission("https://vizaje-nica.com/ru/katalog/chanel", "brand", "ro", { allowedHosts, nodeEnv: "production" })
    const fromRo = parseResolverSubmission("/ro/catalog/chanel", "brand", "ru", { allowedHosts, nodeEnv: "production" })
    expect(fromRu).toEqual({ target: "/ru/katalog/chanel", expectedType: "brand", requestedLocale: "ro" })
    expect(fromRo).toEqual({ target: "/ro/catalog/chanel", expectedType: "brand", requestedLocale: "ru" })
  })

  test("accepts canonical brand URLs with independent locale prefixes and the same URI", async () => {
    const input = parseResolverSubmission("https://vizaje-nica.com/ru/katalog/chanel", "brand", "ro", { allowedHosts, nodeEnv: "production" })
    const client = makeClient(async (url, init) => {
      expectSignedRequest(url, init, input)
      return { status: 200, headers: new Headers(), bodyText: JSON.stringify(brandResponse("ro")) }
    })
    const result = await client.resolve(input)
    expect(result.targets.ru.path).toBe("/ru/katalog/chanel")
    expect(result.targets.ro.path).toBe("/ro/catalog/chanel")
    expect(result.fallback.path).toBe("/ro/catalog/chanel")
  })

  test.each([
    ["ru", "https://vizaje-nica.com/ru/katalog/anastasia-beverly-hills"],
    ["ro", "https://vizaje-nica.com/ro/catalog/anastasia-beverly-hills"],
  ] as const)("accepts the confirmed %s catalog brand route", async (locale, submittedUrl) => {
    const input = parseResolverSubmission(submittedUrl, "brand", locale, { allowedHosts, nodeEnv: "production" })
    const client = makeClient(async (url, init) => {
      expectSignedRequest(url, init, input)
      return { status: 200, headers: new Headers(), bodyText: JSON.stringify(brandResponse(locale, "anastasia-beverly-hills")) }
    })
    const result = await client.resolve(input)
    expect(result.targets.ru.path).toBe("/ru/katalog/anastasia-beverly-hills")
    expect(result.targets.ro.path).toBe("/ro/catalog/anastasia-beverly-hills")
    expect(result.fallback.path).toBe(locale === "ru" ? "/ru/katalog/anastasia-beverly-hills" : "/ro/catalog/anastasia-beverly-hills")
  })

  test.each([
    ["ru", "https://vizaje-nica.com/ru/katalog/paletki"],
    ["ro", "https://vizaje-nica.com/ro/catalog/paletki"],
  ] as const)("accepts the confirmed %s catalog category route", async (locale, submittedUrl) => {
    const input = parseResolverSubmission(submittedUrl, "category", locale, { allowedHosts, nodeEnv: "production" })
    const client = makeClient(async (url, init) => {
      expectSignedRequest(url, init, input)
      return { status: 200, headers: new Headers(), bodyText: JSON.stringify(categoryResponse(locale)) }
    })
    const result = await client.resolve(input)
    expect(result.entity).toEqual({ type: "category", id: "42" })
    expect(result.targets.ru.path).toBe("/ru/katalog/paletki")
    expect(result.targets.ro.path).toBe("/ro/catalog/paletki")
  })

  test("uses the existing RU target when the requested RO translation is unavailable", async () => {
    const input = parseResolverSubmission("https://vizaje-nica.com/ro/catalog/paletki/39897", "product", "ro", { allowedHosts, nodeEnv: "production" })
    const resultBody = productResponse("ro")
    resultBody.targets.ro = { available: false, url: null, path: null }
    resultBody.fallback = { locale: "ru", path: "/ru/katalog/paletki/39897" }
    const client = makeClient(async (url, init) => {
      expectSignedRequest(url, init, input)
      return { status: 200, headers: new Headers(), bodyText: JSON.stringify(resultBody) }
    })
    const result = await client.resolve(input)
    expect(result.fallback).toEqual({ locale: "ru", path: "/ru/katalog/paletki/39897" })
  })

  test("keeps a category and brand with the same slug distinct through expectedType", async () => {
    const input = { target: "/ro/catalog/shared-slug", expectedType: "brand" as const, requestedLocale: "ro" as const }
    const client = makeClient(async (url, init) => {
      expectSignedRequest(url, init, input)
      return {
        status: 409,
        headers: new Headers(),
        bodyText: JSON.stringify({ error: { code: "TYPE_MISMATCH", message: "Expected brand", retryable: false, requestId: "req-type" } }),
      }
    })
    await expect(client.resolve(input)).rejects.toMatchObject({ code: "TYPE_MISMATCH", status: 409, retryable: false })
  })

  test("rejects brand snapshots whose RU and RO URIs disagree", async () => {
    const input = parseResolverSubmission("/ro/catalog/chanel", "brand", "ro", { allowedHosts, nodeEnv: "production" })
    const client = makeClient(async () => ({
      status: 200,
      headers: new Headers(),
      bodyText: JSON.stringify(brandResponse("ro", "chanel", "chanel-ro")),
    }))
    await expect(client.resolve(input)).rejects.toBeInstanceOf(LegacyResolverInvalidResponseError)
  })

  test("rejects unsupported, malformed, mismatched, and untrusted destinations locally", () => {
    expect(() => parseResolverSubmission("https://vizaje-nica.com/ro/catalog/x/123?next=/", "product", "ro", { allowedHosts, nodeEnv: "production" })).toThrow(LegacyResolverRejectedError)
    expect(() => parseResolverSubmission("https://evil.example/ro/catalog/x/123", "product", "ro", { allowedHosts, nodeEnv: "production" })).toThrow(LegacyResolverRejectedError)
    expect(() => parseResolverSubmission("/ru/katalog/chanel", "brand", "ro", { allowedHosts, nodeEnv: "production" })).not.toThrow()
    expect(() => parseResolverSubmission("/ru/catalog/chanel", "brand", "ru", { allowedHosts, nodeEnv: "production" })).toThrow(LegacyResolverRejectedError)
    expect(() => parseResolverSubmission("/ro/katalog/paletki", "category", "ro", { allowedHosts, nodeEnv: "production" })).toThrow(LegacyResolverRejectedError)
    expect(() => parseResolverSubmission("/ru/katalog/x/39897", "product", "ro", { allowedHosts, nodeEnv: "production" })).toThrow(LegacyResolverRejectedError)
    expect(() => parseResolverSubmission("/ru/katalog/chanel", "product", "ru", { allowedHosts, nodeEnv: "production" })).toThrow(LegacyResolverRejectedError)
    expect(() => parseResolverSubmission("//evil.example/ru/brands/x", "brand", "ru", { allowedHosts, nodeEnv: "production" })).toThrow(LegacyResolverRejectedError)
  })

  test.each([
    ["untrusted canonical host", "https://evil.example/ru/katalog/paletki/39897", "/ru/katalog/paletki/39897"],
    ["encoded traversal in canonical path", "https://vizaje-nica.com/ru/katalog/%2e%2e/39897", "/ru/katalog/%2e%2e/39897"],
    ["wrong locale route prefix", "https://vizaje-nica.com/ru/catalog/paletki/39897", "/ru/catalog/paletki/39897"],
  ] as const)("rejects a %s", async (_reason, url, path) => {
    const input = { target: "/ro/catalog/paletki/39897", expectedType: "product" as const, requestedLocale: "ro" as const }
    const resultBody = productResponse("ro")
    resultBody.targets.ru = { available: true, url, path }
    const client = makeClient(async () => ({ status: 200, headers: new Headers(), bodyText: JSON.stringify(resultBody) }))
    await expect(client.resolve(input)).rejects.toBeInstanceOf(LegacyResolverInvalidResponseError)
  })

  test("propagates a Legacy ambiguous-target response as a typed non-retryable rejection", async () => {
    const client = makeClient(async () => ({
      status: 409,
      headers: new Headers(),
      bodyText: JSON.stringify({ error: { code: "AMBIGUOUS_TARGET", message: "Ambiguous route", retryable: false, requestId: "req-1" } }),
    }))
    await expect(client.resolve({ target: "/ro/catalog/paletki/39897", expectedType: "product", requestedLocale: "ro" }))
      .rejects.toMatchObject({ code: "AMBIGUOUS_TARGET", status: 409, retryable: false })
  })

  test("uses a fresh timestamp and nonce on bounded retry after a retryable Legacy error", async () => {
    const attempts: Array<{ timestamp: string; nonce: string }> = []
    let clock = 1_793_779_200_000
    let nonceIndex = 0
    const client = makeClient(async (url, init) => {
      expectSignedRequest(url, init)
      attempts.push({ timestamp: init.headers["x-vp-timestamp"]!, nonce: init.headers["x-vp-nonce"]! })
      if (attempts.length === 1) {
        return {
          status: 503,
          headers: new Headers(),
          bodyText: JSON.stringify({ error: { code: "LEGACY_TEMPORARILY_UNAVAILABLE", message: "Unavailable", retryable: true, requestId: "req-2" } }),
        }
      }
      return { status: 200, headers: new Headers(), bodyText: JSON.stringify(productResponse("ro")) }
    }, {
      now: () => clock,
      nonce: () => Buffer.alloc(16, ++nonceIndex).toString("base64url"),
      sleep: async () => { clock += 1_000 },
    })
    const result = await client.resolve({ target: "/ro/catalog/paletki/39897", expectedType: "product", requestedLocale: "ro" })
    expect(result.entity.id).toBe("12345")
    expect(attempts).toHaveLength(2)
    expect(attempts[0]!.nonce).not.toBe(attempts[1]!.nonce)
    expect(attempts[0]!.timestamp).not.toBe(attempts[1]!.timestamp)
  })

  test("advances the timestamp even when a retry happens in the same clock second", async () => {
    const attempts: string[] = []
    let nonceIndex = 0
    const client = makeClient(async (_url, init) => {
      attempts.push(init.headers["x-vp-timestamp"]!)
      if (attempts.length === 1) return {
        status: 503,
        headers: new Headers(),
        bodyText: JSON.stringify({ error: { code: "LEGACY_TEMPORARILY_UNAVAILABLE", message: "Unavailable", retryable: true, requestId: "req-4" } }),
      }
      return { status: 200, headers: new Headers(), bodyText: JSON.stringify(productResponse("ro")) }
    }, {
      now: () => 1_793_779_200_000,
      nonce: () => Buffer.alloc(16, ++nonceIndex).toString("base64url"),
      sleep: async () => undefined,
    })
    await client.resolve({ target: "/ro/catalog/paletki/39897", expectedType: "product", requestedLocale: "ro" })
    expect(attempts).toEqual(["1793779200", "1793779201"])
  })

  test("does not reuse a nonce across attempts and does not retry malformed responses", async () => {
    let calls = 0
    const repeatedNonce = Buffer.alloc(16, 1).toString("base64url")
    const client = makeClient(async () => {
      calls += 1
      return {
        status: 503,
        headers: new Headers(),
        bodyText: JSON.stringify({ error: { code: "LEGACY_TEMPORARILY_UNAVAILABLE", message: "Unavailable", retryable: true, requestId: "req-3" } }),
      }
    }, { nonce: () => repeatedNonce })
    await expect(client.resolve({ target: "/ro/catalog/paletki/39897", expectedType: "product", requestedLocale: "ro" }))
      .rejects.toBeInstanceOf(LegacyResolverConfigurationError)
    expect(calls).toBe(1)

    const malformedClient = makeClient(async () => ({ status: 200, headers: new Headers(), bodyText: "{}" }))
    await expect(malformedClient.resolve({ target: "/ro/catalog/paletki/39897", expectedType: "product", requestedLocale: "ro" }))
      .rejects.toBeInstanceOf(LegacyResolverInvalidResponseError)
  })

  test("bounds timeout and retry attempts when Legacy cannot be reached", async () => {
    let calls = 0
    let clock = 1_793_779_200_000
    const timeoutClient = makeClient(async (_url, _init, timeouts) => {
      calls += 1
      expect(timeouts.totalTimeoutMs).toBeLessThanOrEqual(2_000)
      throw new DOMException("timed out", "TimeoutError")
    }, {
      now: () => clock,
      nonce: (() => { let index = 0; return () => Buffer.alloc(16, ++index).toString("base64url") })(),
      sleep: async () => { clock += 1_000 },
    })
    await expect(timeoutClient.resolve({ target: "/ro/catalog/paletki/39897", expectedType: "product", requestedLocale: "ro" }))
      .rejects.toBeInstanceOf(LegacyResolverUnavailableError)
    expect(calls).toBe(2)
  })

  test("classifies network errors without retaining error messages or secrets", async () => {
    let calls = 0
    const client = makeClient(async () => {
      calls += 1
      const cause = Object.assign(new Error("private cause"), { name: "SocketError", code: "ECONNRESET" })
      throw Object.assign(new Error("private transport message"), { code: "ECONNRESET", cause })
    })

    let thrown: unknown
    try {
      await client.resolve({ target: "/ro/catalog/paletki/39897", expectedType: "product", requestedLocale: "ro" })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(LegacyResolverUnavailableError)
    expect((thrown as LegacyResolverUnavailableError).diagnostics).toMatchObject({
      category: "connection",
      attempt: 2,
      errorName: "Error",
      errorCode: "ECONNRESET",
      causeName: "SocketError",
      causeCode: "ECONNRESET",
    })
    expect((thrown as Error).message).not.toContain("private")
    expect(calls).toBe(2)
  })

  test("keeps a received Cloudflare-like HTTP status on an invalid response", async () => {
    const client = makeClient(async () => ({
      status: 403,
      headers: new Headers({ server: "cloudflare" }),
      bodyText: "<html>access denied</html>",
    }))

    await expect(client.resolve({ target: "/ro/catalog/paletki/39897", expectedType: "product", requestedLocale: "ro" }))
      .rejects.toMatchObject({ code: "LEGACY_RESOLVER_INVALID_RESPONSE", httpStatus: 403 })
  })

  test("keeps the last retryable HTTP status in unavailable diagnostics", async () => {
    const client = makeClient(async () => ({
      status: 503,
      headers: new Headers(),
      bodyText: JSON.stringify({ error: { code: "LEGACY_TEMPORARILY_UNAVAILABLE", message: "Unavailable", retryable: true, requestId: "req-http" } }),
    }), { sleep: async () => undefined })

    let thrown: unknown
    try {
      await client.resolve({ target: "/ro/catalog/paletki/39897", expectedType: "product", requestedLocale: "ro" })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(LegacyResolverUnavailableError)
    expect((thrown as LegacyResolverUnavailableError).diagnostics).toMatchObject({
      category: "http",
      attempt: 2,
      httpStatus: 503,
      errorCode: "LEGACY_TEMPORARILY_UNAVAILABLE",
    })
  })

  test("rejects missing, malformed, insecure, or multiply-active key configuration", () => {
    expect(() => createLegacyResolverClient({ baseUrl, hmacKeysJson: "[]", allowedHosts })).toThrow()
    expect(() => createLegacyResolverClient({ baseUrl: "http://legacy.internal", hmacKeysJson: JSON.stringify([{ keyId, secret, active: true }]), allowedHosts, nodeEnv: "production" })).toThrow()
    expect(() => createLegacyResolverClient({ baseUrl, hmacKeysJson: JSON.stringify([{ keyId, secret, active: true }, { keyId: `${keyId}-2`, secret, active: true }]), allowedHosts })).toThrow()
  })
})
