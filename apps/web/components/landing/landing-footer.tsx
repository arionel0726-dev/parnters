import Image from "next/image"
import { Send } from "lucide-react"
import { translations, type Locale } from "@/lib/translations"

function FooterLinks({ title, links }: { title: string; links: Array<{ label: string; href: string; external?: boolean }> }) {
  return (
    <div data-scroll-stagger-item className="md:border-l md:border-white/20 md:pl-10 lg:pl-12">
      <p className="text-base leading-6 text-white/55 sm:text-lg">{title}</p>
      <nav className="mt-7 flex flex-col gap-4" aria-label={title}>
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target={link.external ? "_blank" : undefined}
            rel={link.external ? "noreferrer" : undefined}
            className="w-fit text-base leading-6 text-white/90 transition-colors hover:text-white sm:text-lg"
          >
            {link.label}
          </a>
        ))}
      </nav>
    </div>
  )
}

function FooterWordmark({ label }: { label: string }) {
  return (
    <div className="footer-wordmark-stage -mx-5 overflow-hidden sm:-mx-8 lg:-mx-12" data-footer-wordmark>
      <a
        href="#hero"
        className="footer-wordmark block whitespace-nowrap font-bold tracking-[-0.04em]"
        aria-label={label}
      >
        {"Vizaje".split("").map((letter, index) => (
          <span key={`${letter}-${index}`} aria-hidden="true" className="footer-wordmark-letter inline-block">
            {letter}
          </span>
        ))}
      </a>
    </div>
  )
}

export default function LandingFooter({ locale }: { locale: Locale }) {
  const copy = translations[locale]
  const programLinks = [
    { label: copy.footer.links[0], href: "#program" },
    { label: copy.footer.links[1], href: "#contacts" },
    { label: copy.footer.links[2], href: "#contacts" },
    { label: copy.footer.links[3], href: "#contacts" },
  ]
  const supportLinks = [
    { label: copy.footer.telegram, href: "https://t.me/vizaje_partners_bot", external: true },
    { label: copy.footer.contact, href: "#contacts" },
    { label: copy.footer.rules, href: "#program" },
    { label: copy.footer.privacy, href: "#footer" },
  ]

  return (
    <footer className="h-full overflow-hidden bg-[#141414] text-[#fdfdfd]" id="footer">
      <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col px-5 pb-0 pt-20 sm:px-8 sm:pt-24 lg:px-12 lg:pt-[clamp(5rem,10vh,7rem)]">
        <div data-scroll-stagger className="grid grid-cols-2 gap-x-5 gap-y-8 pb-7 md:grid-cols-[1.4fr_0.8fr_0.9fr] md:gap-10 md:pb-8 lg:gap-16">
          <div data-scroll-stagger-item className="col-span-2 md:col-span-1">
            <a href="#hero" className="inline-flex items-center" aria-label={copy.footer.home}>
              <Image src="/brand/logo-v.png" alt="VIZAJE-NICA" width={240} height={33} className="h-auto w-[170px] invert sm:w-[220px]" />
            </a>
            <p className="mt-3 max-w-[390px] text-xs leading-[1.45] text-white/60 sm:mt-5 sm:text-sm lg:text-base">
              {copy.footer.description[0]}
              <br />
              {copy.footer.description[1]}
              <br />
              {copy.footer.description[2]}
            </p>
          </div>

          <FooterLinks title={copy.footer.program} links={programLinks} />
          <FooterLinks title={copy.footer.support} links={supportLinks} />
        </div>

        <div data-scroll-reveal className="flex flex-col gap-3 border-t border-white/20 py-4 text-[11px] leading-5 text-white/65 sm:flex-row sm:items-center sm:gap-5 sm:py-5 sm:text-xs lg:text-sm">
          <span>© 2026 Vizaje-Nica. {copy.footer.copyright}</span>
          <div className="flex flex-wrap gap-x-4 gap-y-2 sm:ml-auto sm:items-center lg:gap-x-6">
            <a href="#footer" className="transition-colors hover:text-white">{copy.footer.userAgreement}</a>
            <a href="#footer" className="transition-colors hover:text-white">{copy.footer.privacy}</a>
            <a href="#contacts" className="transition-colors hover:text-white">{copy.footer.supportLink}</a>
            <a
              href="https://t.me/vizaje_partners_bot"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white/[0.12] px-3 py-1.5 text-white transition-colors hover:bg-white/[0.2]"
            >
              <Send className="size-4 -rotate-12" aria-hidden="true" />
              {copy.footer.telegram}
            </a>
          </div>
        </div>

        <FooterWordmark label={copy.footer.backToTop} />
      </div>
    </footer>
  )
}
