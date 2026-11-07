import { isNull } from "drizzle-orm"
import { closeDatabase, getDb, referralLinks } from "@vizaje/db"
import { getApiEnv } from "../env"
import {
  LegacyResolverConfigurationError,
  LegacyResolverInvalidResponseError,
  LegacyResolverRejectedError,
  LegacyResolverUnavailableError,
  parseResolverSubmission,
  resolveLegacyTarget,
  type ResolverEntityType,
} from "../modules/referral-links/legacy-resolver"

type Classification = "resolvable" | "unresolved" | "ambiguous"
type DryRunRow = { linkId: string; linkType: ResolverEntityType; classification: Classification; reason?: string }

function readLimit(args: string[]) {
  const optionIndex = args.indexOf("--limit")
  if (optionIndex === -1) return 250
  const value = Number(args[optionIndex + 1])
  if (!Number.isInteger(value) || value < 1 || value > 1_000) {
    throw new Error("--limit must be an integer between 1 and 1000")
  }
  return value
}

function resolverErrorCode(error: unknown) {
  if (error instanceof LegacyResolverConfigurationError) return "resolver_not_configured"
  if (error instanceof LegacyResolverUnavailableError) return "legacy_unavailable"
  if (error instanceof LegacyResolverInvalidResponseError) return "resolver_invalid_response"
  if (error instanceof LegacyResolverRejectedError) return error.code.toLowerCase()
  return "invalid_legacy_link"
}

const apiEnv = getApiEnv()
const limit = readLimit(process.argv.slice(2))
const output: DryRunRow[] = []

try {
  const rows = await getDb()
    .select({
      id: referralLinks.id,
      linkType: referralLinks.linkType,
      targetProtocol: referralLinks.targetProtocol,
      targetHost: referralLinks.targetHost,
      targetPath: referralLinks.targetPath,
    })
    .from(referralLinks)
    .where(isNull(referralLinks.legacyEntityId))
    .limit(limit)

  let resolverUnavailable = false
  for (const row of rows) {
    if (resolverUnavailable) {
      output.push({ linkId: row.id, linkType: row.linkType, classification: "unresolved", reason: "legacy_unavailable" })
      continue
    }
    try {
      const submittedUrl = `${row.targetProtocol}://${row.targetHost}${row.targetPath}`
      const request = parseResolverSubmission(submittedUrl, row.linkType, undefined, {
        allowedHosts: apiEnv.VIZAJE_DESTINATION_HOSTS,
        nodeEnv: apiEnv.NODE_ENV,
      })
      await resolveLegacyTarget(request)
      output.push({ linkId: row.id, linkType: row.linkType, classification: "resolvable" })
    } catch (error) {
      const reason = resolverErrorCode(error)
      output.push({
        linkId: row.id,
        linkType: row.linkType,
        classification: reason === "ambiguous_target" ? "ambiguous" : "unresolved",
        reason,
      })
      resolverUnavailable = reason === "legacy_unavailable" || reason === "resolver_not_configured"
    }
  }

  const counts = {
    resolvable: output.filter((row) => row.classification === "resolvable").length,
    unresolved: output.filter((row) => row.classification === "unresolved").length,
    ambiguous: output.filter((row) => row.classification === "ambiguous").length,
  }
  console.log(JSON.stringify({ mode: "read-only-dry-run", selected: rows.length, limit, counts, links: output }, null, 2))
} finally {
  await closeDatabase()
}
