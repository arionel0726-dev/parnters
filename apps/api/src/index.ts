import { auditListQuerySchema, healthResponseSchema } from '@vizaje/contracts'
import { auditLogs, checkDatabaseConnection, creatorApplications, emailDeliveries, getDb, partnerAccounts, partners, payouts, referralLinkClicks, referralLinks, referralOrders } from '@vizaje/db'
import { count, desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { getApiEnv } from './env'
import { auth } from './auth/auth'
import { auditAuthResponse } from './auth/audit'
import { requireAdminAccess, requireAuth, requirePermission, type ApiEnv } from './auth/middleware'
import { logger } from './logger'
import { applicationRoutes, adminApplicationRoutes } from './modules/applications/routes'
import { adminAgreementRoutes, adminPartnerRoutes } from './modules/partners/routes'
import { internalReferralLinkRoutes, partnerReferralLinkRoutes } from './modules/referral-links/routes'
import { creatorDashboardRoutes } from './modules/creator-dashboard/routes'
import { adminFinanceRoutes, creatorFinanceRoutes } from './modules/creator-finance/routes'
import { internalReferralOrderRoutes } from './modules/referral-orders/routes'
import { adminEmailDeliveryRoutes } from './modules/email-deliveries/routes'
import { notificationRoutes } from './modules/notifications/routes'
import { creatorAccountLinkRoutes, legacyAccountLinkRoutes } from './modules/account-linking/routes'
import { creatorReferralAnalyticsRoutes, internalReferralAnalyticsRoutes, publicReferralAnalyticsRoutes } from './modules/referral-analytics/routes'
import { requireServiceAuth } from './auth/middleware'
import { rateLimit } from './http/rate-limit'
import { dispatchDueEmailDeliveries } from './modules/applications/email-delivery'
import { dispatchDuePasswordResetEmails } from './modules/auth/password-reset-email'
import { AUDIT_LOG_RETENTION_INTERVAL_MS, getAuditRetentionPolicy, purgeExpiredAuditLogs } from './modules/audit/retention'

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

function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown"
}

app.use('/v1/auth/sign-in/email', rateLimit((c) => `auth-sign-in:${requestIp(c.req.raw)}`, 10, 60_000))
app.use('/v1/auth/request-password-reset', rateLimit((c) => `auth-password-reset:${requestIp(c.req.raw)}`, 5, 60 * 60_000))

app.all('/v1/auth/*', async (c) => {
  const sessionBefore = await auth.api.getSession({ headers: c.req.raw.headers })
  const response = await auth.handler(c.req.raw)
  await auditAuthResponse(c.req.raw, response, logger, sessionBefore?.user?.id)
  return response
})

app.route('/v1/applications', applicationRoutes)
app.route('/v1/notifications', notificationRoutes)
app.route('/v1/public/referral-analytics', publicReferralAnalyticsRoutes)
app.route('/v1/partner/account-linking', creatorAccountLinkRoutes)

app.route('/v1/partner/referral-links', partnerReferralLinkRoutes)
app.route('/v1/partner', creatorDashboardRoutes)
app.route('/v1/partner', creatorReferralAnalyticsRoutes)
app.route('/v1/partner', creatorFinanceRoutes)

// Account linking has its own directional Legacy -> Partners HMAC guard.
// Register it before the M4 service-token guard so the two auth contracts do
// not overlap.
app.route('/v1/internal/account-linking', legacyAccountLinkRoutes)
app.route('/v1/internal/referral-analytics', internalReferralAnalyticsRoutes)

app.use('/v1/internal/*', requireServiceAuth)
app.route('/v1/internal/referral-links', internalReferralLinkRoutes)
app.route('/v1/internal/referral-orders', internalReferralOrderRoutes)

app.get('/v1/admin/me', requireAuth, async (c) => {
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

app.use('/v1/admin/*', requireAuth)
app.use('/v1/admin/*', requireAdminAccess)

app.route('/v1/admin/applications', adminApplicationRoutes)
app.route('/v1/admin/partners', adminPartnerRoutes)
app.route('/v1/admin/agreements', adminAgreementRoutes)
app.route('/v1/admin', adminFinanceRoutes)
app.route('/v1/admin/email-deliveries', adminEmailDeliveryRoutes)

app.get('/v1/admin/overview', requirePermission('partners:read'), async (c) => {
  const db = getDb()
  const featureEnv = getApiEnv()
  const [partnersCount, pendingApplications, linksCount, clicksCount, ordersCount, failedEmails, pendingPayouts, pendingPayoutsByCurrency] = await Promise.all([
    db.select({ value: count() }).from(partners),
    db.select({ value: count() }).from(creatorApplications).where(eq(creatorApplications.status, 'pending')),
    db.select({ value: count() }).from(referralLinks),
    featureEnv.REFERRAL_TRACKING_ENABLED ? db.select({ value: count() }).from(referralLinkClicks) : Promise.resolve(null),
    featureEnv.CREATOR_FINANCE_ENABLED && featureEnv.REFERRAL_TRACKING_ENABLED ? db.select({ value: count() }).from(referralOrders).where(eq(referralOrders.status, 'confirmed')) : Promise.resolve(null),
    db.select({ value: count() }).from(emailDeliveries).where(eq(emailDeliveries.status, 'failed')),
    featureEnv.PAYOUTS_ENABLED ? db.select({ value: sql<string>`coalesce(sum(${payouts.amount}), 0)::text` }).from(payouts).where(sql`${payouts.status} in ('requested', 'approved')`) : Promise.resolve(null),
    featureEnv.PAYOUTS_ENABLED ? db.select({ currency: payouts.currency, value: sql<string>`coalesce(sum(${payouts.amount}), 0)::text` }).from(payouts).where(sql`${payouts.status} in ('requested', 'approved')`).groupBy(payouts.currency) : Promise.resolve(null),
  ])
  return c.json({
    partners: Number(partnersCount[0]?.value ?? 0),
    pendingApplications: Number(pendingApplications[0]?.value ?? 0),
    referralLinks: Number(linksCount[0]?.value ?? 0),
    clicks: clicksCount ? Number(clicksCount[0]?.value ?? 0) : null,
    confirmedOrders: ordersCount ? Number(ordersCount[0]?.value ?? 0) : null,
    failedEmails: Number(failedEmails[0]?.value ?? 0),
    pendingPayouts: pendingPayouts ? String(pendingPayouts[0]?.value ?? '0') : null,
    pendingPayoutsByCurrency: pendingPayoutsByCurrency?.sort((left, right) => left.currency.localeCompare(right.currency)) ?? null,
  })
})

app.get('/v1/admin/audit', requirePermission('audit:read'), async (c) => {
  const parsed = auditListQuerySchema.safeParse({
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  })
  if (!parsed.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Некорректные параметры журнала.' } }, 400)

  const [entries, totals] = await Promise.all([
    getDb().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(parsed.data.pageSize).offset((parsed.data.page - 1) * parsed.data.pageSize),
    getDb().select({ value: count() }).from(auditLogs),
  ])
  return c.json({ entries, total: Number(totals[0]?.value ?? 0), page: parsed.data.page, pageSize: parsed.data.pageSize })
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
  const workerState = globalThis as typeof globalThis & {
    __vizajeEmailDeliveryWorker?: ReturnType<typeof setInterval>
    __vizajeAuditRetentionWorker?: ReturnType<typeof setInterval>
  }
  if (!workerState.__vizajeEmailDeliveryWorker) {
    const dispatchSafely = () => {
      void Promise.allSettled([dispatchDueEmailDeliveries(), dispatchDuePasswordResetEmails()]).then((results) => {
        if (results.some((result) => result.status === "rejected")) {
          logger.error({ worker: "email-delivery" }, "email delivery worker failed")
        }
      })
    }
    dispatchSafely()
    workerState.__vizajeEmailDeliveryWorker = setInterval(dispatchSafely, 30_000)
  }
  if (!workerState.__vizajeAuditRetentionWorker) {
    const purgeSafely = () => {
      void purgeExpiredAuditLogs()
        .then((cutoff) => {
          logger.info({ cutoff: cutoff.toISOString(), retentionPolicy: getAuditRetentionPolicy() }, "audit log retention cleanup completed")
        })
        .catch((error) => {
          logger.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "audit log retention cleanup failed")
        })
    }
    purgeSafely()
    workerState.__vizajeAuditRetentionWorker = setInterval(purgeSafely, AUDIT_LOG_RETENTION_INTERVAL_MS)
  }
}

export default {
  port: env.API_PORT,
  fetch: app.fetch,
}
