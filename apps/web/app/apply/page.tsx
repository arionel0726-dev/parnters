import { cookies } from "next/headers"
import { ApplicationForm } from "@/features/applications/application-form"
import { localeCookieName, normalizeLocale } from "@/lib/translations"

export const dynamic = "force-dynamic"

export default async function ApplyPage() {
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value)

  return (
    <main className="partners-apply">
      <ApplicationForm locale={locale} />
    </main>
  )
}
