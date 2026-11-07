import { auditLogs, getDb } from "@vizaje/db"
import { and, inArray, lt, notInArray, or } from "drizzle-orm"
import { getApiEnv } from "../../env"

export const AUDIT_LOG_RETENTION_DAYS = 4
export const AUDIT_LOG_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000

const TECHNICAL_ACTIONS = [
  "AUTH_LOGIN_SUCCESS",
  "AUTH_LOGIN_FAILED",
  "AUTH_LOGOUT",
  "AUTH_SESSION_REVOKED",
] as const

const FINANCIAL_ACTIONS = [
  "PAYOUT_REQUESTED",
  "PAYOUT_STATUS_CHANGED",
  "REFERRAL_ORDER_EVENT_INGESTED",
] as const

export function getAuditRetentionPolicy() {
  const env = getApiEnv()
  return {
    technicalDays: env.AUDIT_TECHNICAL_RETENTION_DAYS,
    businessDays: env.AUDIT_BUSINESS_RETENTION_DAYS,
    financialDays: env.AUDIT_FINANCIAL_RETENTION_DAYS,
  }
}

function cutoff(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

export function getAuditLogRetentionCutoff(now = new Date()) {
  return cutoff(now, getAuditRetentionPolicy().technicalDays)
}

export async function purgeExpiredAuditLogs(now = new Date()) {
  const policy = getAuditRetentionPolicy()
  const technicalCutoff = cutoff(now, policy.technicalDays)
  const businessCutoff = cutoff(now, policy.businessDays)
  const financialCutoff = cutoff(now, policy.financialDays)
  await getDb().delete(auditLogs).where(or(
    and(lt(auditLogs.createdAt, technicalCutoff), inArray(auditLogs.action, [...TECHNICAL_ACTIONS])),
    and(
      lt(auditLogs.createdAt, businessCutoff),
      notInArray(auditLogs.action, [...TECHNICAL_ACTIONS, ...FINANCIAL_ACTIONS]),
    ),
    and(lt(auditLogs.createdAt, financialCutoff), inArray(auditLogs.action, [...FINANCIAL_ACTIONS])),
  ))
  return technicalCutoff
}
