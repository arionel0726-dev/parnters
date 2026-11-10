import Link from "next/link"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { LoginForm } from "@/features/auth/login-form"
import { getCurrentAdmin } from "@/lib/auth/server"
import { localeCookieName, normalizeLocale, translations } from "@/lib/translations"
import { AuthPageShell } from "@/components/auth/auth-page-shell"
import { safeAuthReturnTo } from "@/lib/auth/return-to"

export const dynamic = "force-dynamic"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value)
  const copy = translations[locale]
  const returnTo = safeAuthReturnTo((await searchParams).returnTo)

  const current = await getCurrentAdmin()
  if (current) redirect(returnTo ?? (current.partner?.type === "creator" && current.partner.status === "active" ? "/dashboard" : "/app"))

  return (
    <AuthPageShell locale={locale}>
      <section className="w-full max-w-[440px]" aria-labelledby="login-title">
        <div className="text-center">
          <h1 id="login-title" className="auth-login-title">
            {copy.login.title}
          </h1>
          <p className="auth-login-description">{copy.login.description}</p>
        </div>
        <LoginForm locale={locale} returnTo={returnTo ?? undefined} />
        <p className="auth-signup">
          {copy.login.becomePartnerPrompt}{" "}
          <Link href="/apply" className="auth-text-link font-medium underline decoration-from-font underline-offset-4">
            {copy.login.becomePartner}
          </Link>
        </p>
      </section>
    </AuthPageShell>
  )
}
