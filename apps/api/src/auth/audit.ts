import { auditLogs, getDb } from "@vizaje/db"
import type { Logger } from "pino"

const AUTH_BASE_PATH = "/v1/auth"

function normalizeAuthPath(request: Request) {
  const pathname = new URL(request.url).pathname
  return pathname.startsWith(AUTH_BASE_PATH) ? pathname.slice(AUTH_BASE_PATH.length) || "/" : pathname
}

function asUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined
}

async function responseUserId(response: Response) {
  try {
    const body = (await response.clone().json()) as { user?: { id?: unknown } }
    return asUuid(body.user?.id)
  } catch {
    return undefined
  }
}

async function recordAuthAudit({
  action,
  actorUserId,
  request,
  response,
  endpoint,
}: {
  action: string
  actorUserId?: string
  request: Request
  response: Response
  endpoint: string
}) {
  const db = getDb()
  await db.insert(auditLogs).values({
    actorUserId,
    action,
    entityType: "auth",
    entityId: actorUserId,
    metadata: {
      endpoint,
      status: response.status,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    },
  })
}

export async function auditAuthResponse(request: Request, response: Response, logger: Logger, previousUserId?: string) {
  const endpoint = normalizeAuthPath(request)
  const isLogin = endpoint === "/sign-in/email"
  const isLogout = endpoint === "/sign-out"
  const isSessionRevocation = endpoint.includes("revoke-session") || endpoint.includes("revoke-sessions")

  if (!isLogin && !isLogout && !isSessionRevocation) return

  try {
    const actorUserId = isLogin && response.ok ? await responseUserId(response) : asUuid(previousUserId)
    await recordAuthAudit({
      action: isLogin ? (response.ok ? "AUTH_LOGIN_SUCCESS" : "AUTH_LOGIN_FAILED") : isLogout ? "AUTH_LOGOUT" : "AUTH_SESSION_REVOKED",
      actorUserId,
      request,
      response,
      endpoint,
    })
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? { name: error.name, message: error.message } : error, endpoint },
      "auth audit write failed",
    )
  }
}
