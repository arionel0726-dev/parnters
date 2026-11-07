import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { AuthPageShell } from "@/components/auth/auth-page-shell"
import { ActivationForm } from "@/features/auth/account-forms"
import { getCurrentAdmin } from "@/lib/auth/server"
import { localeCookieName, normalizeLocale, translations } from "@/lib/translations"

export const dynamic = "force-dynamic"
export const metadata = { referrer: "no-referrer" as const }

type ActivatePageProps = {
  searchParams: Promise<{ token?: string | string[] }>
}

export default async function ActivatePage({ searchParams }: ActivatePageProps) {
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value)
  const copy = translations[locale].activate
  const current = await getCurrentAdmin()
  if (current) redirect(current.partner?.type === "creator" && current.partner.status === "active" ? "/dashboard" : "/app")

  const { token } = await searchParams
  const hasToken = typeof token === "string" && token.trim().length > 0

  return (
    <AuthPageShell locale={locale}>
      <section className="w-full max-w-[440px]" aria-labelledby="activate-title">
        <div className="text-center">
          <h1 id="activate-title" className="auth-account-title">{copy.title}</h1>
          <p className="auth-account-description">{copy.description}</p>
        </div>
        {hasToken ? (
          <ActivationForm locale={locale} token={token as string} />
        ) : (
          <p className="auth-message auth-message-neutral text-sm leading-5" role="status">{copy.invalidLink}</p>
        )}
        <p className="auth-back-link">
          <Link href="/login" className="auth-text-link font-medium">{copy.backToLogin}</Link>
        </p>
      </section>
    </AuthPageShell>
  )
}
