import { cookies } from "next/headers"

export type CurrentAdmin = {
  user: {
    id: string
    email: string
    name: string | null
    role: string
  }
  session: {
    expiresAt: string
  }
  partner: {
    id: string
    creatorId: string | null
    displayName: string
    status: "active" | "suspended" | "banned"
    type: "creator" | "referral"
  } | null
}

function apiBaseUrl() {
  return (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")
}

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ")

  if (!cookieHeader) return null

  try {
    const response = await fetch(`${apiBaseUrl()}/v1/admin/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    })

    if (!response.ok) return null
    return (await response.json()) as CurrentAdmin
  } catch {
    return null
  }
}
