import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { getDatabaseEnv } from "./env"
import * as schema from "./schema"

let client: postgres.Sql | undefined
let database: ReturnType<typeof drizzle<typeof schema>> | undefined

export function getDb() {
  if (!database) {
    const { DATABASE_URL } = getDatabaseEnv()
    client = postgres(DATABASE_URL, {
      max: 5,
      prepare: false,
    })
    database = drizzle(client, { schema })
  }

  return database
}

export async function checkDatabaseConnection() {
  const db = getDb()
  await db.execute("select 1")
  return true
}

export async function closeDatabase() {
  if (client) {
    await client.end({ timeout: 5 })
    client = undefined
    database = undefined
  }
}
