import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { hashPassword } from "better-auth/crypto"
import { sql } from "drizzle-orm"
import { auditLogs, authAccounts, getDb, users } from "@vizaje/db"
import { z } from "zod"

const emailSchema = z.string().trim().toLowerCase().pipe(z.email())
const passwordSchema = z.string().min(12).max(128)

class BootstrapError extends Error {}

async function promptText(message: string) {
  const readline = createInterface({ input, output })
  try {
    return (await readline.question(message)).trim()
  } finally {
    readline.close()
  }
}

async function promptSecret(message: string) {
  if (!input.isTTY) throw new BootstrapError("A TTY is required for the secure password prompt.")

  return new Promise<string>((resolve, reject) => {
    let value = ""
    const onData = (chunk: Buffer) => {
      const text = chunk.toString()
      for (const character of text) {
        if (character === "\u0003") {
          cleanup()
          reject(new BootstrapError("Bootstrap cancelled."))
          return
        }
        if (character === "\r" || character === "\n") {
          cleanup()
          output.write("\n")
          resolve(value)
          return
        }
        if (character === "\u007f") {
          value = value.slice(0, -1)
          continue
        }
        value += character
      }
    }

    const cleanup = () => {
      input.off("data", onData)
      input.setRawMode?.(false)
      input.pause()
    }

    output.write(message)
    input.setRawMode?.(true)
    input.resume()
    input.on("data", onData)
  })
}

function getEmailArgument() {
  const index = process.argv.findIndex((argument) => argument === "--email")
  if (index >= 0) return process.argv[index + 1]

  const inline = process.argv.find((argument) => argument.startsWith("--email="))
  return inline?.slice("--email=".length)
}

export async function bootstrapAdmin(email: string, password: string) {
  const normalizedEmail = emailSchema.parse(email)
  passwordSchema.parse(password)
  const db = getDb()
  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(password)

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('vizaje:bootstrap-admin'))`)

    const existingUser = await tx.select({ id: users.id }).from(users).limit(1)
    if (existingUser[0]) throw new BootstrapError("Bootstrap already completed: an admin user already exists.")

    const now = new Date()
    await tx.insert(users).values({
      id: userId,
      email: normalizedEmail,
      name: normalizedEmail.split("@")[0] ?? "Vizaje admin",
      emailVerified: true,
      role: "super_admin",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })

    await tx.insert(authAccounts).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    })

    await tx.insert(auditLogs).values({
      actorUserId: userId,
      action: "AUTH_BOOTSTRAP_ADMIN",
      entityType: "user",
      entityId: userId,
      metadata: { source: "cli" },
      createdAt: now,
    })
  })

  return { id: userId, email: normalizedEmail }
}

if (import.meta.main) {
  ;(async () => {
    const email = getEmailArgument() ?? (await promptText("Admin email: "))
    const password = await promptSecret("Admin password (hidden): ")
    const confirmation = await promptSecret("Confirm password (hidden): ")
    if (password !== confirmation) throw new BootstrapError("Passwords do not match.")

    const created = await bootstrapAdmin(email, password)
    output.write(`First super admin created for ${created.email}.\n`)
  })().catch((error) => {
    if (error instanceof z.ZodError) {
      console.error("Bootstrap failed: email or password does not meet the required format.")
    } else if (error instanceof BootstrapError) {
      console.error(`Bootstrap failed: ${error.message}`)
    } else {
      console.error("Bootstrap failed.")
    }
    process.exitCode = 1
  })
}
