import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url().default("http://127.0.0.1:3001"),
  AUTH_TRUSTED_ORIGINS: z.string().default(
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
  ),
  REFERRAL_SERVICE_TOKEN: z.string().min(32),
  REFERRAL_SHORT_URL_ORIGIN: z.string().url().default("http://localhost:3000"),
  VIZAJE_DESTINATION_HOSTS: z
    .string()
    .default("vizaje-nica.com,www.vizaje-nica.com,ru.vizaje-nica.com,ro.vizaje-nica.com,localhost:3000,127.0.0.1:3000"),
  RESEND_API_KEY: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  EMAIL_FROM: z.string().min(3).default("Vizaje Partners <partners@vizaje-nica.com>"),
  WEB_APP_URL: z.string().url().default("http://localhost:3000"),
  LEGACY_RESOLVER_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  CREATOR_FINANCE_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  PAYOUTS_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  REFERRAL_TRACKING_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  AUDIT_TECHNICAL_RETENTION_DAYS: z.coerce.number().int().positive().default(4),
  AUDIT_BUSINESS_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  AUDIT_FINANCIAL_RETENTION_DAYS: z.coerce.number().int().positive().default(2555),
  LEGACY_INTERNAL_BASE_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  LEGACY_RESOLVER_HMAC_KEYS: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  // Separate Legacy -> Partners key ring. Never reuse the Partners -> Legacy resolver keys.
  LEGACY_TO_PARTNERS_HMAC_KEYS: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  LEGACY_ACCOUNT_LINK_REDIRECT_URI: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
})

export function getApiEnv() {
  const env = envSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    API_PORT: process.env.API_PORT,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    AUTH_TRUSTED_ORIGINS: process.env.AUTH_TRUSTED_ORIGINS,
    REFERRAL_SERVICE_TOKEN: process.env.REFERRAL_SERVICE_TOKEN ?? (process.env.NODE_ENV === "production" ? undefined : "vizaje-referral-service-local-development-token-2026"),
    REFERRAL_SHORT_URL_ORIGIN: process.env.REFERRAL_SHORT_URL_ORIGIN,
    VIZAJE_DESTINATION_HOSTS: process.env.VIZAJE_DESTINATION_HOSTS,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    WEB_APP_URL: process.env.WEB_APP_URL,
    LEGACY_RESOLVER_ENABLED: process.env.LEGACY_RESOLVER_ENABLED,
    CREATOR_FINANCE_ENABLED: process.env.CREATOR_FINANCE_ENABLED,
    PAYOUTS_ENABLED: process.env.PAYOUTS_ENABLED,
    REFERRAL_TRACKING_ENABLED: process.env.REFERRAL_TRACKING_ENABLED,
    AUDIT_TECHNICAL_RETENTION_DAYS: process.env.AUDIT_TECHNICAL_RETENTION_DAYS,
    AUDIT_BUSINESS_RETENTION_DAYS: process.env.AUDIT_BUSINESS_RETENTION_DAYS,
    AUDIT_FINANCIAL_RETENTION_DAYS: process.env.AUDIT_FINANCIAL_RETENTION_DAYS,
    LEGACY_INTERNAL_BASE_URL: process.env.LEGACY_INTERNAL_BASE_URL,
    LEGACY_RESOLVER_HMAC_KEYS: process.env.LEGACY_RESOLVER_HMAC_KEYS,
    LEGACY_TO_PARTNERS_HMAC_KEYS: process.env.LEGACY_TO_PARTNERS_HMAC_KEYS,
    LEGACY_ACCOUNT_LINK_REDIRECT_URI: process.env.LEGACY_ACCOUNT_LINK_REDIRECT_URI,
  })

  return {
    ...env,
    AUTH_TRUSTED_ORIGINS: env.AUTH_TRUSTED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    VIZAJE_DESTINATION_HOSTS: env.VIZAJE_DESTINATION_HOSTS.split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  }
}
