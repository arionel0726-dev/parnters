"use client"

import { useCallback, useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { TableSkeletonRows } from "@/components/ui/page-skeletons"

type AuditEntry = {
  id: string
  action: string
  entityType: string
  entityId: string | null
  metadata: Record<string, unknown>
  createdAt: string
  actor: { id: string; name: string | null; email: string } | null
}
type AuditResult = { entries: AuditEntry[]; total: number; page: number; pageSize: number }
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPage = useCallback(async (requestedPage: number, signal: AbortSignal) => {
    setLoading(true)
    if (requestedPage === 1) {
      setEntries([])
      setTotal(0)
      setPage(0)
    }
    setError(null)
    const params = new URLSearchParams({ page: String(requestedPage), pageSize: String(PAGE_SIZE) })
    try {
      const response = await fetch(`/api/admin/audit?${params}`, { cache: "no-store", signal })
      const body = await response.json() as AuditResult & { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? "Не удалось загрузить журнал")
      setEntries(body.entries ?? [])
      setTotal(body.total)
      setPage(body.page)
    } catch (loadError) {
      if (!signal.aborted) setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить журнал")
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => { void loadPage(1, controller.signal) }, 0)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [loadPage])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const goToPage = useCallback((nextPage: number) => {
    if (loading || !page || nextPage < 1 || nextPage > totalPages || nextPage === page) return
    void loadPage(nextPage, new AbortController().signal)
  }, [loadPage, loading, page, totalPages])

  return (
    <section className="min-h-[calc(100vh-64px)] bg-white px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1440px]">
        <div className="border-b border-border pb-7">
          <h1 className="text-4xl tracking-[-0.04em]">Журнал аудита</h1>
          <p className="mt-3 text-sm leading-6 text-smoke">Последние действия администраторов, системных процессов и финансового реестра.</p>
        </div>
        {error ? <p className="mt-6 border border-[#b42318]/30 bg-[#b42318]/5 px-3 py-2 text-sm text-[#8d1d15]" role="alert">{error}</p> : null}
        <div key={`audit-page-${page || "loading"}`} className="dashboard-page-transition">
        <div className="mt-6 overflow-x-auto border border-border">
          <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f6f4] text-xs uppercase tracking-[0.08em] text-smoke"><tr><th className="px-4 py-3 font-medium">Время</th><th className="px-4 py-3 font-medium">Действие</th><th className="px-4 py-3 font-medium">Объект</th><th className="px-4 py-3 font-medium">Кто</th><th className="px-4 py-3 font-medium">Детали</th></tr></thead>
            <tbody>
              {loading ? <TableSkeletonRows columns={5} /> : null}
              {!loading && !entries.length ? <tr><td colSpan={5} className="px-4 py-14 text-center text-smoke">Записей пока нет.</td></tr> : null}
              {!loading ? entries.map((entry) => <tr key={entry.id} className="border-t border-border align-top hover:bg-[#fbfbfa]"><td className="whitespace-nowrap px-4 py-4 text-smoke">{formatDate(entry.createdAt)}</td><td className="px-4 py-4 font-medium">{entry.action}</td><td className="px-4 py-4"><div>{entry.entityType}</div><div className="mt-1 font-mono text-xs text-smoke">{entry.entityId ?? "—"}</div></td><td className="px-4 py-4">{entry.actor?.name ?? entry.actor?.email ?? "Система"}</td><td className="max-w-[420px] px-4 py-4 font-mono text-xs text-smoke"><span className="break-words">{JSON.stringify(entry.metadata)}</span></td></tr>) : null}
            </tbody>
          </table>
        </div>
        {total ? <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between" aria-label="Пагинация журнала аудита">
          <p className="text-xs text-smoke">Страница {page} из {totalPages} · всего {total}</p>
          {totalPages > 1 ? <nav className="flex items-center gap-1" aria-label="Страницы журнала аудита">
            <button type="button" onClick={() => goToPage(page - 1)} disabled={loading || page === 1} className="border border-border px-3 py-2 text-xs font-medium hover:bg-[#f6f6f4] disabled:pointer-events-none disabled:opacity-40">Назад</button>
            {getPageItems(page, totalPages).map((item, index) => item === "ellipsis" ? <span key={`ellipsis-${index}`} className="px-2 text-xs text-smoke">…</span> : <button key={item} type="button" onClick={() => goToPage(item)} disabled={loading} aria-current={item === page ? "page" : undefined} className={cn("h-11 w-11 border p-0 text-xs font-medium", item === page ? "border-ink bg-ink text-white" : "border-border hover:bg-[#f6f6f4]", "disabled:pointer-events-none disabled:opacity-40")}>{item}</button>)}
            <button type="button" onClick={() => goToPage(page + 1)} disabled={loading || page === totalPages} className="border border-border px-3 py-2 text-xs font-medium hover:bg-[#f6f6f4] disabled:pointer-events-none disabled:opacity-40">Далее</button>
          </nav> : null}
          </div> : null}
        </div>
      </div>
    </section>
  )
}
