"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, Search } from "lucide-react"
import { cn } from "@/lib/utils"

type Partner = {
  id: string
  creatorId: string | null
  displayName: string
  email: string | null
  type: "creator" | "referral"
  tier: "starter" | "growth" | "premium"
  status: "active" | "suspended" | "banned"
  commissionRate: string | null
  createdAt: string
}

type PartnerResult = { rows: Partner[]; total: number; page: number; pageSize: number }

const statusLabels = { active: "Active", suspended: "Suspended", banned: "Banned" }
const typeLabels = { creator: "Creator", referral: "Referral" }

function StatusMark({ status }: { status: Partner["status"] }) {
  return <span className={cn("inline-flex items-center gap-2 text-xs", status === "active" ? "text-[#168044]" : status === "suspended" ? "text-[#8a6500]" : "text-[#8d1d15]")}><span className={cn("size-2 rounded-full", status === "active" ? "bg-[#168044]" : status === "suspended" ? "bg-[#d19b00]" : "bg-[#b42318]")} />{statusLabels[status]}</span>
}

export function PartnersPage() {
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<Partner["status"] | "">("")
  const [type, setType] = useState<Partner["type"] | "">("")
  const [result, setResult] = useState<PartnerResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      const params = new URLSearchParams({ page: "1", pageSize: "25" })
      if (query) params.set("search", query)
      if (status) params.set("status", status)
      if (type) params.set("type", type)
      fetch(`/api/admin/partners?${params}`, { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json() as PartnerResult & { error?: { message?: string } }
          if (!response.ok) throw new Error(body.error?.message ?? "Unable to load partners")
          if (active) setResult(body)
        })
        .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load partners") })
        .finally(() => { if (active) setLoading(false) })
    }, 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query, status, type])

  return (
    <section className="min-h-[calc(100vh-64px)] bg-white px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col gap-3 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs uppercase tracking-[0.14em] text-smoke">Partner program</p><h1 className="mt-3 text-4xl tracking-[-0.04em]">Partners</h1><p className="mt-3 text-sm leading-6 text-smoke">Creator profiles, status, and current commission agreements.</p></div><Link href="/app/applications" className="text-sm font-medium text-smoke hover:text-ink">Review applications <ArrowRight className="ml-1 inline size-4" /></Link></div>
        <div className="mt-7 flex flex-col gap-3 lg:flex-row"><label className="relative block w-full max-w-[480px]"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-smoke" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setQuery(search.trim()) }} placeholder="Search creator ID, name, or email" aria-label="Search partners" className="h-10 w-full rounded-none border border-border pl-10 pr-3 text-sm outline-none placeholder:text-smoke focus:border-ink" /></label><select value={status} onChange={(event) => setStatus(event.target.value as Partner["status"] | "")} aria-label="Filter partners by status" className="h-10 rounded-none border border-border bg-white px-3 text-sm outline-none focus:border-ink"><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select><select value={type} onChange={(event) => setType(event.target.value as Partner["type"] | "")} aria-label="Filter partners by type" className="h-10 rounded-none border border-border bg-white px-3 text-sm outline-none focus:border-ink"><option value="">All types</option><option value="creator">Creator</option><option value="referral">Referral</option></select></div>
        {error ? <p className="mt-6 border border-[#b42318]/30 bg-[#b42318]/5 px-3 py-2 text-sm text-[#8d1d15]" role="alert">{error}</p> : null}
        <div className="mt-6 overflow-x-auto border border-border"><table className="w-full min-w-[900px] border-collapse text-left text-sm"><thead className="bg-[#f6f6f4] text-xs uppercase tracking-[0.08em] text-smoke"><tr><th className="px-4 py-3 font-medium">Creator ID</th><th className="px-4 py-3 font-medium">Partner</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Commission</th><th className="px-4 py-3 font-medium">Added</th><th className="px-4 py-3" /></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="px-4 py-14 text-center text-smoke">Loading partners...</td></tr> : null}{!loading && !result?.rows.length ? <tr><td colSpan={7} className="px-4 py-14 text-center text-smoke">No partners match these filters.</td></tr> : null}{!loading ? result?.rows.map((partner) => <tr key={partner.id} className="border-t border-border hover:bg-[#fbfbfa]"><td className="px-4 py-4 font-mono text-xs">{partner.creatorId ?? "—"}</td><td className="px-4 py-4"><div className="font-medium">{partner.displayName}</div><div className="mt-1 text-xs text-smoke">{partner.email ?? "No email"}</div></td><td className="px-4 py-4 text-smoke">{typeLabels[partner.type]}</td><td className="px-4 py-4"><StatusMark status={partner.status} /></td><td className="px-4 py-4">{partner.commissionRate ? `${partner.commissionRate}%` : <span className="text-smoke">Not configured</span>}</td><td className="px-4 py-4 text-smoke">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(partner.createdAt))}</td><td className="px-4 py-4 text-right"><Link href={`/app/partners/${partner.id}`} className="text-sm font-medium hover:underline">View</Link></td></tr>) : null}</tbody></table></div>
        <p className="mt-4 text-xs text-smoke">{result ? `${result.total} partner${result.total === 1 ? "" : "s"}` : ""}</p>
      </div>
    </section>
  )
}

