import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { betterAuth } from "better-auth"
import {
  authAccounts,
  authSessions,
  authVerifications,
  auditLogs,
  getDb,
  users,
} from "@vizaje/db"
import { getApiEnv } from "../env"
import { logger } from "../logger"
import { queuePasswordResetEmail } from "../modules/auth/password-reset-email"

const env = getApiEnv()

export const auth = betterAuth({
  appName: "Vizaje Partners",
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/v1/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: {
      users,
      sessions: authSessions,
      accounts: authAccounts,
      verifications: authVerifications,
    },
    usePlural: true,
  }),
  advanced: {
    database: { generateId: "uuid" },
    disableCSRFCheck: false,
    disableOriginCheck: false,
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    useSecureCookies: env.NODE_ENV === "production",
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await queuePasswordResetEmail({ userId: user.id, email: user.email, url })
    },
    onPasswordReset: async ({ user }) => {
      try {
        await getDb().insert(auditLogs).values({
          actorUserId: user.id,
          action: "AUTH_PASSWORD_RESET",
          entityType: "user",
          entityId: user.id,
          metadata: {},
          createdAt: new Date(),
        })
      } catch (error) {
        logger.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "password reset audit event could not be recorded")
      }
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 10,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
    },
  },
  trustedOrigins: env.AUTH_TRUSTED_ORIGINS,
  disabledPaths: ["/sign-up/email"],
})
