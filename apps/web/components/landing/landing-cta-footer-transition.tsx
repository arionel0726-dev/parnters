import Link from "next/link"
import { ArrowRight } from "lucide-react"
import LandingFooter from "./landing-footer"
import { translations, type Locale } from "@/lib/translations"

export default function LandingCtaFooterTransition({ locale }: { locale: Locale }) {
  const copy = translations[locale]

  return (
    <div className="cta-footer-reveal">
      <section className="cta-footer-cover" id="contacts" aria-labelledby="landing-cta-title">
        <div data-scroll-reveal className="mx-auto flex h-full w-full max-w-[1000px] flex-col items-center justify-center px-5 text-center sm:px-8">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-[#737373] sm:text-sm sm:tracking-[0.28em]">
            {copy.cta.eyebrow}
          </p>
          <h2 id="landing-cta-title" className="mt-6 max-w-[900px] text-[clamp(2rem,5.3vw,4.5rem)] font-medium leading-[1.05] tracking-[-0.055em] text-[#1d1d1d] sm:mt-8">
            {copy.cta.title}
          </h2>
          <p className="mt-6 max-w-[760px] text-base leading-[1.5] text-[#666] sm:mt-8 sm:text-xl">
            {copy.cta.description}
          </p>
          <div data-scroll-stagger className="mt-8 flex w-full max-w-[520px] flex-col gap-3 sm:mt-12 sm:w-auto sm:flex-row sm:gap-4">
            <Link
              data-scroll-stagger-item
              href="/apply"
              className="inline-flex h-[54px] w-full items-center justify-center rounded-full bg-[#050505] px-8 font-medium text-white transition-colors hover:bg-[#252525] sm:w-auto sm:min-w-[200px]"
            >
              {copy.cta.apply}
            </Link>
            <a
              data-scroll-stagger-item
              href="#program"
              className="inline-flex h-[54px] w-full items-center justify-center gap-3 rounded-full bg-[#f0f0f0] px-8 font-medium text-[#1d1d1d] transition-colors hover:bg-[#e5e5e5] sm:w-auto sm:min-w-[200px]"
            >
              {copy.cta.learnMore}
              <ArrowRight className="size-5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <div className="cta-footer-underlay">
        <LandingFooter locale={locale} />
      </div>
    </div>
  )
}
