import { cookies } from "next/headers"
import type { CreatorDashboardData } from "@/components/creator-dashboard/types"

const apiBaseUrl = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")

export async function getCreatorDashboardForLayout() {
  const cookieHeader = (await cookies()).getAll().map(({ name, value }) => `${name}=${value}`).join("; ")
  if (!cookieHeader) return { kind: "unauthenticated" as const }

  try {
    const response = await fetch(`${apiBaseUrl}/v1/partner/dashboard`, { headers: { cookie: cookieHeader }, cache: "no-store" })
    if (response.status === 401) return { kind: "unauthenticated" as const }
    if (response.status === 403) return { kind: "forbidden" as const }
    if (!response.ok) return { kind: "unavailable" as const }
    return { kind: "ok" as const, dashboard: await response.json() as CreatorDashboardData }
  } catch {
    return { kind: "unavailable" as const }
  }
}
