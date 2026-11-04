import { apiRateLimits, getDb } from "@vizaje/db"
import { sql } from "drizzle-orm"
import type { MiddlewareHandler } from "hono"
import type { ApiEnv } from "../auth/middleware"
import { apiError } from "./errors"

export async function consumeRateLimit(bucketKey: string, limit: number, windowMs: number) {
  const now = new Date()
  const expiredBefore = new Date(now.getTime() - windowMs)
  const expiresAt = new Date(now.getTime() + windowMs * 2)
  const rows = await getDb()
    .insert(apiRateLimits)
    .values({ bucketKey, windowStartedAt: now, requestCount: 1, expiresAt, updatedAt: now })
    .onConflictDoUpdate({
      target: apiRateLimits.bucketKey,
      set: {
        windowStartedAt: sql`case when ${apiRateLimits.windowStartedAt} <= ${expiredBefore.toISOString()} then ${now.toISOString()} else ${apiRateLimits.windowStartedAt} end`,
        requestCount: sql`case when ${apiRateLimits.windowStartedAt} <= ${expiredBefore.toISOString()} then 1 else ${apiRateLimits.requestCount} + 1 end`,
        expiresAt,
        updatedAt: now,
      },
    })
    .returning({ requestCount: apiRateLimits.requestCount, windowStartedAt: apiRateLimits.windowStartedAt })

  const row = rows[0]
  if (!row) throw new Error("Rate limit counter could not be updated")
  const allowed = row.requestCount <= limit
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((row.windowStartedAt.getTime() + windowMs - now.getTime()) / 1000))
  return { allowed, remaining: Math.max(0, limit - row.requestCount), retryAfterSeconds }
}

export function rateLimit(bucket: string | ((c: Parameters<MiddlewareHandler<ApiEnv>>[0]) => string), limit: number, windowMs: number): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const bucketKey = typeof bucket === "function" ? bucket(c) : bucket
    const result = await consumeRateLimit(bucketKey, limit, windowMs)
    c.header("RateLimit-Limit", String(limit))
    c.header("RateLimit-Remaining", String(result.remaining))
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds))
      return apiError(c, 429, "RATE_LIMITED", "Слишком много запросов. Попробуйте позже.")
    }
    await next()
  }
}
