import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { AuthPageShell } from "@/components/auth/auth-page-shell"
import { ResetPasswordForm } from "@/features/auth/account-forms"
import { getCurrentAdmin } from "@/lib/auth/server"
import { localeCookieName, normalizeLocale, translations } from "@/lib/translations"

export const dynamic = "force-dynamic"

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value)
  const copy = translations[locale].resetPassword
  const current = await getCurrentAdmin()
  if (current) redirect(current.partner?.type === "creator" && current.partner.status === "active" ? "/dashboard" : "/app")
  const token = (await searchParams).token?.trim()

  return (
    <AuthPageShell locale={locale}>
      <section className="w-full max-w-[440px]" aria-labelledby="reset-password-title">
        <div className="text-center">
          <h1 id="reset-password-title" className="auth-account-title">{copy.title}</h1>
          <p className="auth-account-description">{copy.description}</p>
        </div>
        {token ? <ResetPasswordForm locale={locale} token={token} /> : <p className="auth-message auth-message-error text-sm leading-5" role="alert">{copy.invalidToken}</p>}
        <p className="auth-back-link">
          <Link href="/login" className="auth-text-link font-medium">{translations[locale].forgotPassword.backToLogin}</Link>
        </p>
      </section>
    </AuthPageShell>
  )
}
