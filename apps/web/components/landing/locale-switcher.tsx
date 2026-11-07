"use client"

import { useRouter } from "next/navigation"
import { localeCookieName, type Locale } from "@/lib/translations"

type LocaleSwitcherProps = {
  locale: Locale
  className?: string
  onChange?: () => void
  locales?: readonly Locale[]
}

export default function LocaleSwitcher({ locale, className = "", onChange, locales = ["ru", "ro"] }: LocaleSwitcherProps) {
  const router = useRouter()

  function selectLocale(nextLocale: Locale) {
    if (nextLocale === locale) {
      return
    }

    // This is an intentional event-handler side effect that persists the selected locale.
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = `${localeCookieName}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`
    onChange?.()
    router.refresh()
  }

  return (
    <div role="group" aria-label={locale === "ro" ? "Alege limba" : "Выбрать язык"} className={className}>
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={locale === option}
          onClick={() => selectLocale(option)}
          className={`transition-colors ${locale === option ? "text-primary" : "text-foreground/45 hover:text-foreground"}`}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
