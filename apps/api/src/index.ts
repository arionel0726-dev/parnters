import { healthResponseSchema } from '@vizaje/contracts'
import { auditLogs, checkDatabaseConnection, getDb, partnerAccounts, partners } from '@vizaje/db'
import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { getApiEnv } from './env'
import { auth } from './auth/auth'
import { auditAuthResponse } from './auth/audit'
import { requireAuth, requirePermission, type ApiEnv } from './auth/middleware'
import { logger } from './logger'
import { applicationRoutes, adminApplicationRoutes } from './modules/applications/routes'
import { adminPartnerRoutes } from './modules/partners/routes'
import { internalReferralLinkRoutes, partnerReferralLinkRoutes } from './modules/referral-links/routes'
import { creatorDashboardRoutes } from './modules/creator-dashboard/routes'
import { requireServiceAuth } from './auth/middleware'
import { dispatchDueEmailDeliveries } from './modules/applications/email-delivery'

const env = getApiEnv()
export const app = new Hono<ApiEnv>()

app.get('/', (c) => {
  return c.json({
    name: 'Vizaje Partners API',
    version: '0.1.0',
  })
})

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'vizaje-partners-api',
  })
})

app.get('/v1/health/db', async (c) => {
  try {
    await checkDatabaseConnection()

    const response = healthResponseSchema.parse({
      status: 'ok',
      service: 'vizaje-partners-api',
      database: { status: 'connected' },
    })

    return c.json(response, 200)
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? { name: error.name, message: error.message } : error },
      'database health check failed',
    )

    const response = healthResponseSchema.parse({
      status: 'error',
      service: 'vizaje-partners-api',
      database: { status: 'unavailable' },
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is unavailable',
      },
    })

    return c.json(response, 503)
  }
})

app.all('/v1/auth/*', async (c) => {
  const sessionBefore = await auth.api.getSession({ headers: c.req.raw.headers })
  const response = await auth.handler(c.req.raw)
  await auditAuthResponse(c.req.raw, response, logger, sessionBefore?.user?.id)
  return response
})

app.route('/v1/applications', applicationRoutes)

app.route('/v1/partner/referral-links', partnerReferralLinkRoutes)
app.route('/v1/partner', creatorDashboardRoutes)

app.use('/v1/internal/*', requireServiceAuth)
app.route('/v1/internal/referral-links', internalReferralLinkRoutes)

app.use('/v1/admin/*', requireAuth)

app.route('/v1/admin/applications', adminApplicationRoutes)
app.route('/v1/admin/partners', adminPartnerRoutes)

app.get('/v1/admin/me', async (c) => {
  const current = c.get('auth')
  const partnerRows = await getDb()
    .select({ id: partners.id, creatorId: partners.creatorId, displayName: partners.displayName, status: partners.status, type: partners.type })
    .from(partnerAccounts)
    .innerJoin(partners, eq(partnerAccounts.partnerId, partners.id))
    .where(eq(partnerAccounts.userId, current.user.id))
    .limit(1)
  return c.json({
    user: {
      id: current.user.id,
      email: current.user.email,
      name: current.user.name,
      role: current.user.role,
    },
    partner: partnerRows[0] ?? null,
    session: {
      expiresAt: current.session.expiresAt,
    },
  })
})

app.get('/v1/admin/audit', requirePermission('audit:read'), async (c) => {
  const entries = await getDb().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100)
  return c.json({ entries })
})

function safeErrorMetadata(error: unknown) {
  const metadata: Record<string, string> = {}
  const fields = [
    ['code', 'code'],
    ['severity', 'severity'],
    ['table', 'table_name', 'table'],
    ['column', 'column_name', 'column'],
    ['constraint', 'constraint_name', 'constraint'],
  ] as const
  const seen = new Set<object>()
  let current: unknown = error
  let depth = 0

  while (current && typeof current === 'object' && depth < 5 && !seen.has(current)) {
    seen.add(current)
    const value = current as Record<string, unknown>

    if (depth === 0 && typeof value.name === 'string') metadata.name = value.name
    if (depth === 1 && typeof value.name === 'string') metadata.causeName = value.name
    for (const [target, ...keys] of fields) {
      if (metadata[target]) continue
      const found = keys.map((key) => value[key]).find((field): field is string => typeof field === 'string')
      if (found) metadata[target] = found
    }

    current = value.cause
    depth += 1
  }

  if (!metadata.name) metadata.name = 'UnknownError'
  return metadata
}

app.onError((error, c) => {
  logger.error({ err: safeErrorMetadata(error) }, 'unhandled request error')
  return c.json(
    {
      status: 'error',
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    },
    500,
  )
})

if (import.meta.main) {
  const workerState = globalThis as typeof globalThis & { __vizajeEmailDeliveryWorker?: ReturnType<typeof setInterval> }
  if (!workerState.__vizajeEmailDeliveryWorker) {
    const dispatchSafely = () => {
      void dispatchDueEmailDeliveries().catch((error) => {
        logger.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "email delivery worker failed")
      })
    }
    dispatchSafely()
    workerState.__vizajeEmailDeliveryWorker = setInterval(dispatchSafely, 30_000)
  }
}

export default {
  port: env.API_PORT,
  fetch: app.fetch,
}
