import { getApiEnv } from "../../env"

export class InvalidReferralDestinationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidReferralDestinationError"
  }
}

const pathRules = {
  homepage: /^(?:\/(?:ru|ro)\/?)?$/,
  // Vizaje-Nica uses the same catalog prefix for categories, brands and
  // products. The selected linkType remains the source of intent: a single
  // catalog slug is valid for either a category or a brand, while a pair of
  // slugs is a product route. Legacy remains the authority for entity lookup.
  product: /^\/(?:ru|ro)\/(?:(?:(?:catalog|katalog)\/)?products?\/[^/]+(?:\/[^/]+)*|(?:catalog|katalog)\/[^/]+\/[^/]+)\/?$/,
  category: /^\/(?:ru|ro)\/(?:(?:(?:catalog|katalog)\/)?categories?\/[^/]+(?:\/[^/]+)*|(?:catalog|katalog)\/[^/]+)\/?$/,
  brand: /^\/(?:ru|ro)\/(?:(?:brands?\/[^/]+(?:\/[^/]+)*)|(?:catalog|katalog)\/[^/]+)\/?$/,
} as const

function isSafePath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") &&
    !/%(?:2f|5c|2e)/i.test(path) && !/(?:^|\/)\.{1,2}(?:\/|$)/.test(path)
}

function rawAbsolutePath(value: string) {
  return value.match(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*(\/[^?#]*)?(?:[?#]|$)/i)?.[1] ?? null
}

export type ReferralDestination = {
  targetProtocol: "http" | "https"
  targetHost: string
  targetPath: string
}

export function parseReferralDestination(targetUrl: string, linkType: keyof typeof pathRules): ReferralDestination {
  const rawPath = rawAbsolutePath(targetUrl)
  if (rawPath && !isSafePath(rawPath)) {
    throw new InvalidReferralDestinationError("Ссылка содержит небезопасный путь.")
  }

  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    throw new InvalidReferralDestinationError("Укажите корректную ссылку Vizaje-Nica.")
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidReferralDestinationError("Разрешены только HTTP и HTTPS ссылки.")
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new InvalidReferralDestinationError("Ссылка не должна содержать credentials или hash.")
  }
  if ([...parsed.searchParams.keys()].some((key) => /^(?:redirect(?:_uri|_url)?|return(?:_to|url)?|next|continue|destination|target|vp_attribution)$/i.test(key))) {
    throw new InvalidReferralDestinationError("Ссылка не должна содержать параметры перенаправления.")
  }

  const env = getApiEnv()
  const host = parsed.host.toLowerCase()
  if (!env.VIZAJE_DESTINATION_HOSTS.includes(host)) {
    throw new InvalidReferralDestinationError("Ссылка ведёт на неподдерживаемый домен Vizaje-Nica.")
  }

  const pathname = parsed.pathname || "/"
  if (!isSafePath(pathname)) {
    throw new InvalidReferralDestinationError("Ссылка содержит небезопасный путь.")
  }
  if (!pathRules[linkType].test(pathname)) {
    throw new InvalidReferralDestinationError("Путь не соответствует выбранному типу ссылки.")
  }

  return {
    targetProtocol: parsed.protocol.slice(0, -1) as "http" | "https",
    targetHost: host,
    targetPath: `${pathname}${parsed.search}`,
  }
}

export function buildTargetUrl(destination: Pick<ReferralDestination, "targetHost" | "targetPath"> & { targetProtocol: string }) {
  return `${destination.targetProtocol}://${destination.targetHost}${destination.targetPath}`
}
