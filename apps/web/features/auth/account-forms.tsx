"use client"

import { useRouter } from "next/navigation"
import { LoaderCircle } from "lucide-react"
import { useState, type FormEvent } from "react"
import { translations, type Locale } from "@/lib/translations"

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const copy = translations[locale].forgotPassword
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setUnavailable(false)
    if (!validEmail(email)) {
      setError(copy.invalidEmail)
      return
    }

    // Password reset is intentionally disabled until a trusted email delivery service is configured.
    setUnavailable(true)
  }

  return (
    <form className="auth-account-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-fields">
      <div className="auth-field">
        <label htmlFor="recovery-email" className="auth-label block text-sm font-medium">{copy.email}</label>
        <input
          id="recovery-email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setError(null)
            setUnavailable(false)
          }}
          className="auth-input auth-login-input"
          placeholder={copy.emailPlaceholder}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "recovery-error" : unavailable ? "recovery-unavailable" : undefined}
        />
      </div>
      </div>
      {error ? <p id="recovery-error" className="auth-message auth-message-error text-sm leading-5" role="alert">{error}</p> : null}
      {unavailable ? <p id="recovery-unavailable" className="auth-message auth-message-neutral text-sm leading-5" role="status">{copy.unavailable}</p> : null}
      <button type="submit" className="auth-primary-button auth-login-button">
        {copy.submit}
      </button>
    </form>
  )
}

export function ActivationForm({ locale, token }: { locale: Locale; token: string }) {
  const copy = translations[locale].activate
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!password || !confirmation) {
      setError(copy.required)
      return
    }
    if (password.length < 12) {
      setError(copy.tooShort)
      return
    }
    if (password !== confirmation) {
      setError(copy.mismatch)
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/applications/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
      if (!response.ok) {
        setError(response.status === 400 ? copy.invalidLink : copy.serviceError)
        return
      }
      router.replace("/login")
      router.refresh()
    } catch {
      setError(copy.serviceError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="auth-account-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-fields">
      <div className="auth-field">
        <label htmlFor="new-password" className="auth-label block text-sm font-medium">{copy.password}</label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            setError(null)
          }}
          className="auth-input auth-login-input"
          placeholder={copy.passwordPlaceholder}
          required
          disabled={loading}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "activation-error" : undefined}
        />
      </div>
      <div className="auth-field">
        <label htmlFor="confirm-password" className="auth-label block text-sm font-medium">{copy.confirmPassword}</label>
        <input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => {
            setConfirmation(event.target.value)
            setError(null)
          }}
          className="auth-input auth-login-input"
          placeholder={copy.confirmPasswordPlaceholder}
          required
          disabled={loading}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "activation-error" : undefined}
        />
      </div>
      </div>
      {error ? <p id="activation-error" className="auth-message auth-message-error text-sm leading-5" role="alert">{error}</p> : null}
      <button type="submit" className="auth-primary-button auth-login-button" disabled={loading}>
        {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {loading ? copy.loading : copy.submit}
      </button>
    </form>
  )
}
