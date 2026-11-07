import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { CreatorDashboardShell } from "@/components/creator-dashboard/creator-dashboard-shell"
import { DashboardLocaleProvider } from "@/components/dashboard/dashboard-locale-provider"
import { getCreatorDashboardForLayout } from "@/lib/creator-dashboard/server"
import { localeCookieName, normalizeLocale } from "@/lib/translations"

export const dynamic = "force-dynamic"

export default async function CreatorDashboardLayout({ children }: { children: ReactNode }) {
  const result = await getCreatorDashboardForLayout()
  if (result.kind === "unauthenticated") redirect("/login")
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value)

  if (result.kind !== "ok") {
    const unavailable = result.kind === "unavailable"
    return (
      <div className="app-surface flex min-h-svh items-center justify-center bg-background px-5 text-foreground">
        <section className="w-full max-w-lg border border-border bg-background p-8 text-center sm:p-12">
          <h1 className="text-2xl font-medium">{unavailable ? (locale === "ro" ? "Contul este temporar indisponibil" : "Кабинет временно недоступен") : (locale === "ro" ? "Nu ai acces la contul de creator" : "Нет доступа к кабинету креатора")}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {unavailable ? (locale === "ro" ? "Datele nu au putut fi încărcate. Reîmprospătează pagina mai târziu." : "Не удалось загрузить данные. Обновите страницу чуть позже.") : (locale === "ro" ? "Contul este disponibil creatorilor activi și aprobați. Dacă este o eroare, contactează asistența." : "Кабинет доступен активным одобренным креаторам. Если это ошибка, обратитесь в поддержку.")}
          </p>
          <a href={unavailable ? "/dashboard" : "/login"} className="mt-6 inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-medium text-primary-foreground">
            {unavailable ? (locale === "ro" ? "Încearcă din nou" : "Повторить") : (locale === "ro" ? "Spre autentificare" : "Ко входу")}
          </a>
        </section>
      </div>
    )
  }

  return <DashboardLocaleProvider locale={locale} mode="creator"><CreatorDashboardShell profile={result.dashboard.profile}>{children}</CreatorDashboardShell></DashboardLocaleProvider>
}
