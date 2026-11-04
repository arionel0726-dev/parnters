import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { CreatorDashboardShell } from "@/components/creator-dashboard/creator-dashboard-shell"
import { getCreatorDashboardForLayout } from "@/lib/creator-dashboard/server"
import "./creator-dashboard.css"

export const dynamic = "force-dynamic"

export default async function CreatorDashboardLayout({ children }: { children: ReactNode }) {
  const result = await getCreatorDashboardForLayout()
  if (result.kind === "unauthenticated") redirect("/login")

  if (result.kind !== "ok") {
    const unavailable = result.kind === "unavailable"
    return (
      <div className="app-surface flex min-h-svh items-center justify-center bg-background px-5 text-foreground">
        <section className="w-full max-w-lg border border-border bg-background p-8 text-center sm:p-12">
          <h1 className="text-2xl font-medium">{unavailable ? "Кабинет временно недоступен" : "Нет доступа к кабинету креатора"}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {unavailable ? "Не удалось загрузить данные. Обновите страницу чуть позже." : "Кабинет доступен активным одобренным креаторам. Если это ошибка, обратитесь в поддержку."}
          </p>
          <a href={unavailable ? "/dashboard" : "/login"} className="mt-6 inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-medium text-primary-foreground">
            {unavailable ? "Повторить" : "Ко входу"}
          </a>
        </section>
      </div>
    )
  }

  return <CreatorDashboardShell displayName={result.dashboard.profile.displayName}>{children}</CreatorDashboardShell>
}
