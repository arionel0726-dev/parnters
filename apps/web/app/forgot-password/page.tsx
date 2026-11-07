import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { AuthPageShell } from "@/components/auth/auth-page-shell"
import { ForgotPasswordForm } from "@/features/auth/account-forms"
import { getCurrentAdmin } from "@/lib/auth/server"
import { localeCookieName, normalizeLocale, translations } from "@/lib/translations"

export const dynamic = "force-dynamic"

export default async function ForgotPasswordPage() {
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value)
  const copy = translations[locale].forgotPassword
  const current = await getCurrentAdmin()
  if (current) redirect(current.partner?.type === "creator" && current.partner.status === "active" ? "/dashboard" : "/app")

  return (
    <AuthPageShell locale={locale}>
      <section className="w-full max-w-[440px]" aria-labelledby="forgot-password-title">
        <div className="text-center">
          <h1 id="forgot-password-title" className="auth-account-title">{copy.title}</h1>
          <p className="auth-account-description">{copy.description}</p>
        </div>
        <ForgotPasswordForm locale={locale} />
        <p className="auth-back-link">
          <Link href="/login" className="auth-text-link font-medium">{copy.backToLogin}</Link>
        </p>
      </section>
    </AuthPageShell>
  )
}
