import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { AppShell } from "@/components/layout/app-shell"
import { DashboardLocaleProvider } from "@/components/dashboard/dashboard-locale-provider"
import { AccentProvider } from "@/features/appearance/appearance-provider"
import { getCurrentAdmin } from "@/lib/auth/server"
import { localeCookieName, normalizeLocale } from "@/lib/translations"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const current = await getCurrentAdmin()
  if (!current) redirect("/login")
  const creatorMode = current.partner?.type === "creator"
  const locale = creatorMode ? normalizeLocale((await cookies()).get(localeCookieName)?.value) : "ru"

  return (
    <DashboardLocaleProvider locale={locale} mode={creatorMode ? "creator" : "admin"}>
      <AccentProvider>
        <AppShell
          partnerMode={creatorMode}
          adminRole={current.partner?.type === "creator" ? "creator" : current.user.role}
          partner={current.partner ? {
            displayName: current.partner.displayName,
            email: current.user.email,
            creatorId: current.partner.creatorId,
            status: current.partner.status,
          } : null}
        >
          {children}
        </AppShell>
      </AccentProvider>
    </DashboardLocaleProvider>
  )
}
