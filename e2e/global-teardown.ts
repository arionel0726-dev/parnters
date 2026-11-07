import { execFile } from "node:child_process"
import { promisify } from "node:util"

const run = promisify(execFile)

export default async function globalTeardown() {
  await run("bun", ["run", "--cwd", "apps/api", "e2e:fixture", "--", "teardown"], { cwd: process.cwd(), env: process.env })
}
