import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { AccentProvider } from "@/features/appearance/appearance-provider"
import { getCurrentAdmin } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const current = await getCurrentAdmin()
  if (!current) redirect("/login")

  return (
    <AccentProvider>
      <AppShell partnerMode={Boolean(current.partner)}>{children}</AppShell>
    </AccentProvider>
  )
}
