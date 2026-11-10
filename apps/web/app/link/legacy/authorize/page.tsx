import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { LegacyAuthorizeForm } from "@/features/account-linking/legacy-authorize-form"
import { getCurrentAdmin } from "@/lib/auth/server"
import { localeCookieName, normalizeLocale, translations } from "@/lib/translations"

export const dynamic = "force-dynamic"
export const metadata = { referrer: "no-referrer" as const }

const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/

type AuthorizePageProps = {
  searchParams: Promise<{ ticket?: string | string[] }>
}

function apiBaseUrl() {
  return (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")
}

function loginReturnTo(ticket: string) {
  return `/link/legacy/authorize?ticket=${encodeURIComponent(ticket)}`
}

export default async function LegacyAuthorizePage({ searchParams }: AuthorizePageProps) {
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value)
  const copy = translations[locale].accountLinking
  const rawTicket = (await searchParams).ticket
  const ticket = typeof rawTicket === "string" ? rawTicket : undefined

  if (!ticket || !TICKET_PATTERN.test(ticket)) {
    return <AccountLinkMessage title={copy.title} message={copy.invalid} locale={locale} />
  }

  const current = await getCurrentAdmin()
  if (!current) redirect(`/login?returnTo=${encodeURIComponent(loginReturnTo(ticket))}`)
  if (current.partner?.type !== "creator" || current.partner.status !== "active" || !current.partner.creatorId) {
    return <AccountLinkMessage title={copy.title} message={copy.forbidden} locale={locale} />
  }

  const cookieHeader = (await cookies()).getAll().map(({ name, value }) => `${name}=${value}`).join("; ")
  const origin = process.env.WEB_APP_URL ?? "http://localhost:3000"
  const inspection = await fetch(`${apiBaseUrl()}/v1/partner/account-linking/inspect`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader, origin },
    body: JSON.stringify({ ticket }),
    cache: "no-store",
  }).catch(() => null)

  if (!inspection?.ok) {
    return <AccountLinkMessage title={copy.title} message={inspection?.status === 400 ? copy.invalid : copy.unavailable} locale={locale} />
  }

  return (
    <main className="min-h-svh bg-paper px-6 py-10 text-ink sm:px-10 sm:py-16">
      <section className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-[560px] flex-col justify-center" aria-labelledby="legacy-account-link-title">
        <Link href="/dashboard" className="mb-12 text-sm text-smoke transition-colors hover:text-ink">
          {copy.backToDashboard}
        </Link>
        <div className="border-b border-border pb-8">
          <h1 id="legacy-account-link-title" className="text-4xl font-medium tracking-[-0.04em] sm:text-5xl">{copy.title}</h1>
          <p className="mt-5 max-w-[480px] text-lg leading-7 text-smoke">{copy.description}</p>
        </div>
        <p className="mt-8 text-base leading-7 text-smoke">{copy.note}</p>
        <LegacyAuthorizeForm locale={locale} ticket={ticket} />
      </section>
    </main>
  )
}

function AccountLinkMessage({ title, message, locale }: { title: string; message: string; locale: "ru" | "ro" }) {
  const copy = translations[locale].accountLinking
  return (
    <main className="min-h-svh bg-paper px-6 py-10 text-ink sm:px-10 sm:py-16">
      <section className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-[560px] flex-col justify-center" aria-labelledby="legacy-account-link-title">
        <h1 id="legacy-account-link-title" className="text-4xl font-medium tracking-[-0.04em] sm:text-5xl">{title}</h1>
        <p className="auth-message auth-message-neutral mt-8 leading-6" role="status">{message}</p>
        <Link href="/dashboard" className="auth-primary-button auth-login-button mt-8 !w-full no-underline">
          {copy.backToDashboard}
        </Link>
      </section>
    </main>
  )
}
