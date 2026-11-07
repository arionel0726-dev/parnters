"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { ArrowRight, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { TableSkeletonRows } from "@/components/ui/page-skeletons"

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
const PAGE_SIZE = 25
type PageItem = number | "ellipsis"

function getPageItems(currentPage: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  const items: PageItem[] = []
  for (let page = 1; page <= totalPages; page += 1) {
    if (!pages.has(page)) {
      if (items[items.length - 1] !== "ellipsis") items.push("ellipsis")
      continue
    }
    items.push(page)
  }
  return items
}

const statusLabels = { active: "Активен", suspended: "Приостановлен", banned: "Заблокирован" }
const typeLabels = { creator: "Креатор", referral: "Реферальный партнёр" }

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

  const loadPartners = useCallback(async (requestedPage: number, signal: AbortSignal) => {
    setLoading(true)
    if (requestedPage === 1) setResult(null)
    setError(null)
    const params = new URLSearchParams({ page: String(requestedPage), pageSize: String(PAGE_SIZE) })
    if (query) params.set("search", query)
    if (status) params.set("status", status)
    if (type) params.set("type", type)
    try {
      const response = await fetch(`/api/admin/partners?${params}`, { cache: "no-store", signal })
      const body = await response.json() as PartnerResult & { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? "Не удалось загрузить партнёров")
      setResult(body)
    } catch (loadError) {
      if (!signal.aborted) setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить партнёров")
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [query, status, type])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => { void loadPartners(1, controller.signal) }, 0)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [loadPartners])

  const goToPage = useCallback((nextPage: number) => {
    if (!result || loading || nextPage < 1 || nextPage > Math.ceil(result.total / result.pageSize) || nextPage === result.page) return
    void loadPartners(nextPage, new AbortController().signal)
  }, [loadPartners, loading, result])

  const currentPage = result?.page ?? 1
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1

  return (
    <section className="min-h-[calc(100vh-64px)] bg-white px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col gap-3 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-4xl tracking-[-0.04em]">Партнёры</h1><p className="mt-3 text-sm leading-6 text-smoke">Профили креаторов, статусы и действующие комиссионные соглашения.</p></div><Link href="/app/applications" className="text-sm font-medium text-smoke hover:text-ink">Проверить заявки <ArrowRight className="ml-1 inline size-4" /></Link></div>
        <div className="mt-7 flex flex-col gap-3 lg:flex-row"><label className="relative block w-full max-w-[480px]"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-smoke" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setQuery(search.trim()) }} placeholder="Поиск по Creator ID, имени или email" aria-label="Поиск партнёров" className="h-10 w-full rounded-none border border-border pl-10 pr-3 text-sm outline-none placeholder:text-smoke focus:border-ink" /></label><select value={status} onChange={(event) => setStatus(event.target.value as Partner["status"] | "")} aria-label="Фильтр партнёров по статусу" className="h-10 rounded-none border border-border bg-white px-3 text-sm outline-none focus:border-ink"><option value="">Все статусы</option><option value="active">Активные</option><option value="suspended">Приостановленные</option><option value="banned">Заблокированные</option></select><select value={type} onChange={(event) => setType(event.target.value as Partner["type"] | "")} aria-label="Фильтр партнёров по типу" className="h-10 rounded-none border border-border bg-white px-3 text-sm outline-none focus:border-ink"><option value="">Все типы</option><option value="creator">Креаторы</option><option value="referral">Реферальные партнёры</option></select></div>
        {error ? <p className="mt-6 border border-[#b42318]/30 bg-[#b42318]/5 px-3 py-2 text-sm text-[#8d1d15]" role="alert">{error}</p> : null}
        <div key={`partners-page-${result?.page ?? "loading"}`} className="dashboard-page-transition">
          <div className="mt-6 overflow-x-auto border border-border"><table className="w-full min-w-[900px] border-collapse text-left text-sm"><thead className="bg-[#f6f6f4] text-xs uppercase tracking-[0.08em] text-smoke"><tr><th className="px-4 py-3 font-medium">Creator ID</th><th className="px-4 py-3 font-medium">Партнёр</th><th className="px-4 py-3 font-medium">Тип</th><th className="px-4 py-3 font-medium">Статус</th><th className="px-4 py-3 font-medium">Комиссия</th><th className="px-4 py-3 font-medium">Добавлен</th><th className="px-4 py-3" /></tr></thead><tbody>{loading ? <TableSkeletonRows columns={7} /> : null}{!loading && !result?.rows.length ? <tr><td colSpan={7} className="px-4 py-14 text-center text-smoke">Партнёры по этим фильтрам не найдены.</td></tr> : null}{!loading ? result?.rows.map((partner) => <tr key={partner.id} className="border-t border-border hover:bg-[#fbfbfa]"><td className="px-4 py-4 font-mono text-xs">{partner.creatorId ?? "—"}</td><td className="px-4 py-4"><div className="font-medium">{partner.displayName}</div><div className="mt-1 text-xs text-smoke">{partner.email ?? "Email не указан"}</div></td><td className="px-4 py-4 text-smoke">{typeLabels[partner.type]}</td><td className="px-4 py-4"><StatusMark status={partner.status} /></td><td className="px-4 py-4">{partner.commissionRate ? `${partner.commissionRate}%` : <span className="text-smoke">Не настроена</span>}</td><td className="px-4 py-4 text-smoke">{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(partner.createdAt))}</td><td className="px-4 py-4 text-right"><Link href={`/app/partners/${partner.id}`} className="text-sm font-medium text-[#007AFF] transition-colors hover:text-[#0066CC] hover:underline">Открыть</Link></td></tr>) : null}</tbody></table></div>
        {result ? <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between" aria-label="Пагинация партнёров">
          <p className="text-xs text-smoke">Страница {currentPage} из {totalPages} · всего {result.total}</p>
          {totalPages > 1 ? <nav className="flex items-center gap-1" aria-label="Страницы партнёров">
            <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={loading || currentPage === 1} className="border border-border px-3 py-2 text-xs font-medium hover:bg-[#f6f6f4] disabled:pointer-events-none disabled:opacity-40">Назад</button>
            {getPageItems(currentPage, totalPages).map((item, index) => item === "ellipsis" ? <span key={`ellipsis-${index}`} className="px-2 text-xs text-smoke">…</span> : <button key={item} type="button" onClick={() => goToPage(item)} disabled={loading} aria-current={item === currentPage ? "page" : undefined} className={cn("h-11 w-11 border p-0 text-xs font-medium", item === currentPage ? "border-ink bg-ink text-white" : "border-border hover:bg-[#f6f6f4]", "disabled:pointer-events-none disabled:opacity-40")}>{item}</button>)}
            <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={loading || currentPage === totalPages} className="border border-border px-3 py-2 text-xs font-medium hover:bg-[#f6f6f4] disabled:pointer-events-none disabled:opacity-40">Далее</button>
          </nav> : null}
          </div> : null}
        </div>
      </div>
    </section>
  )
}

