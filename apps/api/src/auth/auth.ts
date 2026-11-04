import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { betterAuth } from "better-auth"
import {
  authAccounts,
  authSessions,
  authVerifications,
  getDb,
  users,
} from "@vizaje/db"
import { getApiEnv } from "../env"

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
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  trustedOrigins: env.AUTH_TRUSTED_ORIGINS,
  disabledPaths: ["/sign-up/email", "/request-password-reset", "/reset-password"],
})
