import Link from "next/link"
import Image from "next/image"
import { cookies } from "next/headers"
import { localeCookieName, normalizeLocale, translations } from "@/lib/translations"

export const dynamic = "force-dynamic"

export default async function ApplicationSuccessPage() {
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value)
  const copy = translations[locale].applicationForm

  return (
    <main className="partners-apply partners-apply__success-page">
      <section className="partners-apply__success" aria-labelledby="application-success-title">
        <Image
          className="partners-apply__success-icon"
          src="/icons/success-check.svg"
          alt=""
          aria-hidden="true"
          width={96}
          height={96}
        />
        <h1 className="partners-apply__title" id="application-success-title">{copy.successTitle}</h1>
        <p className="partners-apply__description">{copy.successDescription}</p>
        <Link className="partners-apply__button partners-apply__success-link" href="/">
          {copy.home}
        </Link>
      </section>
    </main>
  )
}
