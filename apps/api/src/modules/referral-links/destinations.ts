import { getApiEnv } from "../../env"

export class InvalidReferralDestinationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidReferralDestinationError"
  }
}

const pathRules = {
  homepage: /^(?:\/(?:ru|ro)\/?)?$/,
  // Vizaje-Nica product pages use both the explicit products route and
  // catalog/category-slug/numeric-product-id (for example /ro/catalog/kisti/1648).
  product: /^\/(?:ru|ro)\/(?:(?:catalog\/)?products?\/[^/]+(?:\/[^/]+)*|catalog\/[^/]+\/\d+)\/?$/,
  category: /^\/(?:ru|ro)\/(?:catalog\/)?categories?\/[^/]+(?:\/[^/]+)*\/?$/,
  brand: /^\/(?:ru|ro)\/brands?\/[^/]+(?:\/[^/]+)*\/?$/,
} as const

export type ReferralDestination = {
  targetProtocol: "http" | "https"
  targetHost: string
  targetPath: string
}

export function parseReferralDestination(targetUrl: string, linkType: keyof typeof pathRules): ReferralDestination {
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
  if ([...parsed.searchParams.keys()].some((key) => /^(?:redirect(?:_uri|_url)?|return(?:_to|url)?|next|continue|destination|target)$/i.test(key))) {
    throw new InvalidReferralDestinationError("Ссылка не должна содержать параметры перенаправления.")
  }

  const env = getApiEnv()
  const host = parsed.host.toLowerCase()
  if (!env.VIZAJE_DESTINATION_HOSTS.includes(host)) {
    throw new InvalidReferralDestinationError("Ссылка ведёт на неподдерживаемый домен Vizaje-Nica.")
  }

  const pathname = parsed.pathname || "/"
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
