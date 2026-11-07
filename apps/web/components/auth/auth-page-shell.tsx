import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import LocaleSwitcher from "@/components/landing/locale-switcher"
import { translations, type Locale } from "@/lib/translations"
import { AuthPageTransition } from "./auth-page-transition"

const decorations = [
  { src: "/brand/login/01_dolce_gabbana_light_blue.png", className: "auth-decoration--blue", width: 741, height: 984, loading: "eager" as const },
  { src: "/brand/login/02_cream_texture.png", className: "auth-decoration--cream-texture", width: 624, height: 807, loading: "eager" as const },
  { src: "/brand/login/03_mac_lipstick.png", className: "auth-decoration--lipstick", width: 729, height: 945, loading: "lazy" as const },
  { src: "/brand/login/04_serum_dropper.png", className: "auth-decoration--dropper", width: 618, height: 915, loading: "lazy" as const },
  { src: "/brand/login/05_pink_blush_texture.png", className: "auth-decoration--blush", width: 495, height: 609, loading: "lazy" as const },
  { src: "/brand/login/06_clarins_double_serum.png", className: "auth-decoration--clarins", width: 651, height: 792, loading: "eager" as const },
  { src: "/brand/login/07_cream_jar.png", className: "auth-decoration--cream-jar", width: 597, height: 780, loading: "lazy" as const },
]

export function AuthPageShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const copy = translations[locale]

  return (
    <AuthPageTransition className="auth-page flex min-h-svh flex-col">
      <div className="auth-decoration-layer" aria-hidden="true">
        {decorations.map((decoration) => (
          <Image
            key={decoration.src}
            src={decoration.src}
            alt=""
            aria-hidden="true"
            width={decoration.width}
            height={decoration.height}
            loading={decoration.loading}
            sizes="(max-width: 767px) 25vw, 22vw"
            className={`auth-decoration ${decoration.className}`}
          />
        ))}
      </div>

      <header className="auth-toolbar absolute inset-x-5 top-4 z-20 flex items-center justify-between sm:inset-x-8 sm:top-6 lg:inset-x-12">
        <Link href="/" className="auth-text-link text-[13px] font-medium sm:text-sm">
          {copy.login.home}
        </Link>
        <LocaleSwitcher locale={locale} className="auth-language-switcher flex items-center gap-2 text-sm font-medium uppercase sm:gap-3" />
      </header>

      <main className="auth-main relative z-10 mx-auto flex w-full flex-1 flex-col items-center justify-center py-16 sm:py-20">
        <Link href="/" className="auth-brand flex flex-col items-center" aria-label={copy.footer.home}>
          <Image
            src="/brand/vizaje-nica-logo-transparent.png"
            alt="VIZAJE-NICA"
            width={286}
            height={63}
            priority
            className="auth-logo h-auto w-[clamp(156px,20vw,260px)]"
          />
          <span className="auth-brand-subtitle mt-1 text-[10px] font-medium uppercase leading-[1.4] sm:mt-1.5 sm:text-xs">
            PARTNERS
          </span>
        </Link>
        <div className="auth-content w-full max-w-[440px]">{children}</div>
      </main>
    </AuthPageTransition>
  )
}
