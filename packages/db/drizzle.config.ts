import "dotenv/config"
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://partners:partners_local_dev_only@127.0.0.1:5434/vizaje_partners",
  },
  strict: true,
  verbose: true,
})
