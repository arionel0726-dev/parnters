"use client"

import { useEffect, useState } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"

type ReferralLink = { id: string; code: string; targetHost: string; targetPath: string; linkType: "homepage" | "product" | "category" | "brand"; status: "active" | "revoked"; createdAt: string; shortUrl: string; targetUrl: string }
const typeLabels = { homepage: "Главная", product: "Товар", category: "Категория", brand: "Бренд" }

export function AdminReferralLinks({ partnerId }: { partnerId: string }) {
  const [links, setLinks] = useState<ReferralLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void fetch(`/api/admin/partners/${partnerId}/referral-links`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { links?: ReferralLink[]; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? "Не удалось загрузить ссылки.")
      if (active) setLinks(body.links ?? [])
    }).catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить ссылки.") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [partnerId])

  async function copyLink(link: ReferralLink) {
    await navigator.clipboard.writeText(link.shortUrl)
    setCopiedId(link.id)
    window.setTimeout(() => setCopiedId((current) => current === link.id ? null : current), 1600)
  }

  return <section className="border-t border-border pt-5"><h2 className="text-xs uppercase tracking-[0.12em] text-smoke">Referral links</h2><div className="mt-4">{loading ? <p className="text-sm text-smoke">Loading links...</p> : null}{error ? <p className="text-sm text-[#8d1d15]" role="alert">{error}</p> : null}{!loading && !error && !links.length ? <p className="text-sm text-smoke">No referral links yet.</p> : null}{!loading && !error && links.length ? <div className="space-y-3">{links.map((link) => <div key={link.id} className="flex flex-col gap-3 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2 text-xs text-smoke"><span>{typeLabels[link.linkType]}</span><span className={link.status === "active" ? "text-[#168044]" : "text-smoke"}>{link.status}</span></div><a href={link.targetUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 truncate text-sm hover:underline"><span className="truncate">{link.targetHost}{link.targetPath}</span><ExternalLink className="size-3 shrink-0 text-smoke" /></a><p className="mt-1 font-mono text-xs text-smoke">{link.code}</p></div><button type="button" onClick={() => void copyLink(link)} disabled={link.status === "revoked"} className="inline-flex h-8 shrink-0 items-center justify-center gap-2 border border-border px-3 text-xs font-medium hover:bg-[#f6f6f4] disabled:opacity-40">{copiedId === link.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copiedId === link.id ? "Copied" : "Copy"}</button></div>)}</div> : null}</div></section>
}
