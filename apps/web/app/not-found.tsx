import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { cookies } from "next/headers"
import { localeCookieName, normalizeLocale, translations } from "@/lib/translations"

export const metadata: Metadata = {
  title: "404 · Vizaje Partners",
  robots: { index: false, follow: false },
}

export default async function NotFound() {
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value)
  const copy = translations[locale].notFound

  return (
    <div className="not-found-page">
      <main className="not-found-main">
        <div className="not-found-intro">
          <p className="not-found-code">{copy.code}</p>
          <h1 className="not-found-title">{copy.title}</h1>
          <p className="not-found-description">{copy.description}</p>
          <Link className="not-found-home" href="/">
            {copy.home}
          </Link>
        </div>

        <nav className="not-found-suggestions" aria-label={copy.suggestionsTitle}>
          <h2>{copy.suggestionsTitle}</h2>
          <ul>
            {copy.links.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>

      <footer className="not-found-footer">
        <div className="not-found-footer-inner">
          <Link href="/" aria-label={translations[locale].footer.home}>
            <Image
              src="/brand/logo-v.png"
              alt="VIZAJE-NICA"
              width={240}
              height={33}
              className="not-found-logo"
            />
          </Link>
          <p>© 2026 Vizaje-Nica. {translations[locale].footer.copyright}</p>
        </div>
      </footer>
    </div>
  )
}
