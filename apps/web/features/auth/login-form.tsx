"use client"

import Link from "next/link"
import { Eye, EyeOff, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { translations, type Locale } from "@/lib/translations"

type AccountProfile = {
  partner?: { type: string; status: string } | null
}

export function LoginForm({ locale }: { locale: Locale }) {
  const copy = translations[locale]
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [step, setStep] = useState<"email" | "password">("email")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setError(step === "email" ? copy.login.emailRequired : copy.login.requiredError)
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(copy.login.invalidEmailError)
      return
    }

    if (step === "email") {
      setEmail(normalizedEmail)
      setStep("password")
      return
    }
    if (!password) {
      setError(copy.login.requiredError)
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: normalizedEmail, password, callbackURL: "/app" }),
      })

      if (!response.ok) {
        setError(copy.login.invalidError)
        return
      }

      const profileResponse = await fetch("/api/admin/me", {
        credentials: "include",
        cache: "no-store",
      })

      if (!profileResponse.ok) {
        if (profileResponse.status === 401 || profileResponse.status === 403) {
          await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" }).catch(() => undefined)
          setError(copy.login.unavailableError)
        } else {
          setError(copy.login.serviceError)
        }
        return
      }

      const profile = (await profileResponse.json()) as AccountProfile
      if (profile.partner?.type === "creator" && profile.partner.status !== "active") {
        await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" }).catch(() => undefined)
        setError(copy.login.unavailableError)
        return
      }

      router.replace(profile.partner?.type === "creator" ? "/dashboard" : "/app")
      router.refresh()
    } catch {
      setError(copy.login.serviceError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="auth-login-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-login-flow">
        <div className="auth-login-flow-item auth-field" data-active={step === "email"} aria-hidden={step !== "email"}>
          <label htmlFor="email" className="sr-only">{copy.login.email}</label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setError(null)
            }}
            className="auth-input auth-login-input"
            placeholder={copy.login.emailPlaceholder}
            required
            disabled={loading || step !== "email"}
            tabIndex={step === "email" ? 0 : -1}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error" : undefined}
          />
        </div>

        <div className="auth-login-flow-item auth-login-email-summary" data-active={step === "password"} aria-hidden={step !== "password"}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-[#666]">{email}</span>
            <button type="button" className="shrink-0 text-[#1d1d1d] underline underline-offset-4" onClick={() => { setStep("email"); setPassword(""); setError(null) }} disabled={loading || step !== "password"} tabIndex={step === "password" ? 0 : -1}>
              {copy.login.changeEmail}
            </button>
          </div>
        </div>

        <div className="auth-login-flow-item auth-field auth-password-field" data-active={step === "password"} aria-hidden={step !== "password"}>
          <label htmlFor="password" className="sr-only">{copy.login.password}</label>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setError(null)
            }}
            className="auth-input auth-login-input auth-password-input"
            placeholder={copy.login.passwordPlaceholder}
            required
            disabled={loading || step !== "password"}
            tabIndex={step === "password" ? 0 : -1}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error" : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="auth-password-toggle"
            aria-label={showPassword ? copy.login.hidePassword : copy.login.showPassword}
            aria-pressed={showPassword}
            disabled={loading}
          >
            {showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className="auth-login-flow-item auth-login-forgot-wrap" data-active={step === "password"} aria-hidden={step !== "password"}>
        <Link href="/forgot-password" className="auth-forgot-link" tabIndex={step === "password" ? 0 : -1}>{copy.login.forgotPassword}</Link>
      </div>

      {error ? <p id="login-error" className="auth-message auth-message-error auth-login-error" role="alert">{error}</p> : null}

      <button type="submit" className="auth-primary-button auth-login-button" disabled={loading}>
        {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {loading ? copy.login.loading : step === "email" ? copy.login.continue : copy.login.submit}
      </button>
    </form>
  )
}
