import { defineConfig } from "@playwright/test"

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100"

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseURL)) {
  throw new Error("E2E_BASE_URL must point to a local development server")
}

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  outputDir: "/private/tmp/vizaje-p1.3-playwright",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "/private/tmp/vizaje-p1.3-playwright/results.json" }]],
  use: {
    baseURL,
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ru-RU",
    colorScheme: "light",
    actionTimeout: 10_000,
  },
  webServer: [
    {
      command: "RESEND_API_KEY='' API_PORT=3101 BETTER_AUTH_URL=http://localhost:3101 WEB_APP_URL=http://localhost:3100 AUTH_TRUSTED_ORIGINS=http://localhost:3100,http://localhost:3101 LEGACY_RESOLVER_ENABLED=false CREATOR_FINANCE_ENABLED=false PAYOUTS_ENABLED=false REFERRAL_TRACKING_ENABLED=false bun run --cwd apps/api start",
      url: "http://localhost:3101/health",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "API_INTERNAL_URL=http://localhost:3101 NEXT_PUBLIC_API_BASE_URL=http://localhost:3101 PORT=3100 NEXT_DIST_DIR=.next-e2e bun run --cwd apps/web dev",
      url: "http://localhost:3100/login",
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
})
