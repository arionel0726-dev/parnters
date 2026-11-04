import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgres"),
})

export function getDatabaseEnv() {
  return envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
  })
}
