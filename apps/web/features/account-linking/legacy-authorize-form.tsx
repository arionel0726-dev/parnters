"use client"

import Link from "next/link"
import { LoaderCircle } from "lucide-react"
import { useState } from "react"
import { translations, type Locale } from "@/lib/translations"

const CALLBACK_PATH = "/account/creator-link/callback"

export function LegacyAuthorizeForm({ locale, ticket }: { locale: Locale; ticket: string }) {
  const copy = translations[locale].accountLinking
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (loading) return
    setError(null)
    setLoading(true)

    try {
      const response = await fetch("/api/partner/account-linking/authorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ ticket, confirmed: true }),
      })
      const body = await response.json().catch(() => null) as { callbackUrl?: unknown }
      if (!response.ok || typeof body?.callbackUrl !== "string") {
        setError(response.status === 400 ? copy.invalid : copy.error)
        return
      }

      const callback = new URL(body.callbackUrl)
      if (callback.protocol !== "https:" || callback.pathname !== CALLBACK_PATH ||
        callback.username || callback.password || callback.hash ||
        !callback.searchParams.get("code") || !callback.searchParams.get("state")) {
        setError(copy.error)
        return
      }

      window.location.replace(callback.toString())
    } catch {
      setError(copy.error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-10 flex flex-col gap-4">
      {error ? <p className="auth-message auth-message-error" role="alert">{error}</p> : null}
      <button type="button" className="auth-primary-button auth-login-button !mt-0 !w-full" onClick={confirm} disabled={loading}>
        {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {loading ? copy.loading : copy.confirm}
      </button>
      <Link href="/dashboard" className="auth-back-link !mt-2" replace>
        {copy.cancel}
      </Link>
    </div>
  )
}
