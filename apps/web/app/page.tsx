import Image from "next/image"
import Link from "next/link"
import { cookies } from "next/headers"
import { ChartNoAxesColumnIncreasing, Layers2, Sparkles } from "lucide-react"
import LandingCtaFooterTransition from "../components/landing/landing-cta-footer-transition"
import LocaleSwitcher from "../components/landing/locale-switcher"
import LandingMobileNav from "../components/landing/landing-mobile-nav"
import LandingScrollBehavior from "../components/landing/landing-scroll-behavior"
import PartnersHero from "../components/landing/partners-hero"
import { localeCookieName, normalizeLocale, translations } from "@/lib/translations"

const creatorBenefitIcons = [Sparkles, Layers2, ChartNoAxesColumnIncreasing]

function BrandLogo({ className = "", inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Image
      src="/brand/logo-v.png"
      alt=""
      width={240}
      height={33}
      className={`${className} ${inverted ? "invert" : ""}`}
    />
  )
}

function BrandSymbol({ className = "", inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Image
      src="/brand/mini-logo.svg"
      alt=""
      width={36}
      height={27}
      className={`${className} ${inverted ? "invert" : ""}`}
    />
  )
}

function HowItWorksIcon({ position, className = "" }: { position: number; className?: string }) {
  return (
    <span
      className={`block aspect-square bg-no-repeat ${className}`}
      aria-hidden="true"
      style={{
        backgroundImage: "url('/brand/how-it-works/icons.png')",
        backgroundPosition: `${position * 50}% center`,
        backgroundSize: "300% 100%",
      }}
    >
    </span>
  )
}

export default async function MarketingHome() {
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value)
  const copy = translations[locale]
  const programPoints = copy.program.steps.map((step, iconPosition) => ({ ...step, iconPosition }))
  const creatorBenefits = copy.community.benefits.map((benefit, index) => ({ ...benefit, icon: creatorBenefitIcons[index] }))
  const creatorMedia = [
    { label: copy.community.mediaLabels[0], src: "/brand/hero-products/product-06.png", alt: copy.community.mediaAlt[0] },
    { label: copy.community.mediaLabels[1], src: "/brand/hero-products/product-04.png", alt: copy.community.mediaAlt[1] },
    { label: copy.community.mediaLabels[2], src: "/brand/hero-products/product-01.png", alt: copy.community.mediaAlt[2] },
  ]

  return (
    <div className="landing-light">
      <LandingScrollBehavior />
      <main className="relative z-[2] min-h-screen bg-[#fdfdfd] pt-16 text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-transparent text-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[#fdfdfd] backdrop-blur-xl" aria-hidden="true" />
        <div className="relative mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 sm:gap-3" aria-label={copy.header.home}>
            <BrandSymbol className="h-[23px] w-[30px] md:hidden" />
            <BrandLogo className="hidden h-auto w-[200px] max-w-[45vw] object-contain object-left md:block" />
          </Link>

          <nav className="flex items-center gap-2 text-sm font-medium sm:gap-4 sm:text-base" aria-label={copy.header.navigation}>
            <LocaleSwitcher locale={locale} className="mr-1 hidden items-center gap-2 border-r border-border pr-4 md:mr-2 md:flex md:gap-3 md:pr-6" />
            <Link href="/login" className="hidden h-9 items-center justify-center rounded-full border border-border px-3 transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground md:inline-flex md:px-5">
              {copy.header.login}
            </Link>
            <Link href="/apply" className="hidden h-9 items-center justify-center rounded-full bg-primary px-3 text-primary-foreground transition-colors hover:bg-primary/85 md:inline-flex md:px-5">
              {copy.header.signUp}
            </Link>
            <LandingMobileNav locale={locale} />
          </nav>
        </div>
      </header>

      <PartnersHero locale={locale} />

      <section className="bg-[#f2f2f2] text-foreground" id="program">
        <div className="mx-auto w-full max-w-[1440px] px-5 py-16 sm:px-8 sm:py-28 lg:px-12">
          <div className="flex flex-col items-center text-center" data-scroll-reveal>
            <span className="inline-flex min-h-9 items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-medium leading-6 text-[#050505] sm:min-h-10 sm:px-5 sm:text-base">
              {copy.program.badge}
            </span>
            <h2 className="mt-7 max-w-[1200px] text-[clamp(30px,4vw,56px)] font-medium leading-[1.12] tracking-[-0.045em] text-[#050505] sm:mt-8">
              {copy.program.title}
            </h2>
          </div>

          <div className="mx-auto mt-9 grid max-w-[1344px] grid-cols-1 gap-4 sm:mt-14 sm:grid-cols-3 sm:gap-5" data-scroll-stagger>
            {programPoints.map((point, index) => (
              <article key={point.title} data-scroll-stagger-item className="flex min-h-[370px] flex-col gap-5 rounded-3xl border border-[#ebebeb] bg-white p-5 sm:min-h-[520px] sm:gap-0 sm:p-5 sm:pb-9">
                <div className="order-1 flex aspect-[1.8/1] w-full items-center justify-center rounded-[20px] bg-[#f7f7f7]">
                  <HowItWorksIcon position={point.iconPosition} className="size-[min(100%,10rem)] sm:size-[min(100%,14rem)]" />
                </div>
                <div className="order-2 min-w-0 text-left">
                  <p className="text-sm font-medium leading-[1.4] text-[#737373] sm:mt-6 sm:text-xl sm:font-normal">{String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-2 text-xl font-medium leading-[1.15] tracking-[-0.035em] text-[#050505] sm:mt-3 sm:text-[28px]">{point.title}</h3>
                  <p className="mt-4 text-sm leading-[1.45] text-[#525252] sm:mt-5 sm:text-lg">{point.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-background text-foreground" id="community">
        <div className="mx-auto grid w-full max-w-[1600px] gap-12 px-5 py-16 sm:px-8 sm:py-28 lg:grid-cols-[2fr_3fr] lg:items-center lg:gap-16 lg:px-16 lg:py-32">
          <div data-scroll-reveal>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#a3a3a3] sm:text-[13px] sm:tracking-[0.2em]">{copy.community.eyebrow}</p>
            <h2 className="mt-6 max-w-[640px] text-[clamp(2.75rem,4.5vw,4.5rem)] font-medium leading-[1.05] tracking-[-0.05em]">
              <span className="block">{copy.community.firstTitle}</span>
              <span className="community-title-second block" data-scroll-tone>{copy.community.secondTitle}</span>
            </h2>
            <p className="mt-6 max-w-[620px] text-base leading-[1.5] tracking-[-0.02em] text-[#525252] sm:mt-8 sm:text-xl">
              {copy.community.description}
            </p>

            <div className="mt-9 space-y-6 sm:mt-12 sm:space-y-8">
              {creatorBenefits.map((benefit) => {
                const Icon = benefit.icon

                return (
                  <div key={benefit.title} className="flex items-start gap-4">
                    <span className="flex w-7 shrink-0 justify-start sm:w-10">
                      <Icon className="mt-0.5 size-5 shrink-0 stroke-[1.5] sm:size-6" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-base font-medium leading-[1.3] tracking-[-0.02em] sm:text-lg">{benefit.title}</h3>
                      <p className="mt-1 text-sm leading-[1.45] tracking-[-0.01em] text-[#737373] sm:mt-1.5 sm:text-base">{benefit.body}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-4" data-scroll-stagger>
            {creatorMedia.map((media, index) => (
              <figure key={media.label} data-scroll-stagger-item data-community-parallax={index} className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-[#f2f2f2]">
                <Image src={media.src} alt={media.alt} fill loading="eager" sizes="(min-width: 1024px) 20vw, 33vw" className="object-cover" />
                <figcaption className="absolute inset-x-0 top-0 px-3 pt-3 text-[10px] font-medium tracking-[0.1em] text-[#050505] sm:px-6 sm:pt-6 sm:text-[13px] sm:tracking-[0.12em]">{media.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      </main>
      <LandingCtaFooterTransition locale={locale} />
    </div>
  )
}
