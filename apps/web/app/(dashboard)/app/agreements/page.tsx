"use client"

import { useCallback, useEffect, useState } from "react"
import { TableSkeletonRows } from "@/components/ui/page-skeletons"

type AgreementStatus = "draft" | "active" | "expired" | "cancelled"
type AgreementRow = {
  agreement: {
    id: string
    commissionRate: string
    startsAt: string
    endsAt: string | null
    status: AgreementStatus
    reason: string
    createdAt: string
  }
  partner: {
    id: string
    creatorId: string | null
    displayName: string
    email: string | null
    status: string
  }
}

const statusLabels: Record<AgreementStatus, string> = {
  draft: "Черновик",
  active: "Активно",
  expired: "Истекло",
  cancelled: "Отменено",
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(value))
}

export default function AgreementsPage() {
  const [status, setStatus] = useState<"" | AgreementStatus>("")
  const [rows, setRows] = useState<AgreementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const query = status ? `?status=${status}` : ""
    try {
      const response = await fetch(`/api/admin/agreements${query}`, { cache: "no-store" })
      const body = await response.json() as { agreements?: AgreementRow[]; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? "Не удалось загрузить соглашения")
      setRows(body.agreements ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить соглашения")
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  return (
    <section className="min-h-[calc(100vh-64px)] bg-white px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col gap-3 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-4xl tracking-[-0.04em]">Комиссионные соглашения</h1>
            <p className="mt-3 text-sm leading-6 text-smoke">История ставок и текущие условия креаторов. Новое соглашение создаётся из карточки партнёра.</p>
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Фильтр соглашений по статусу" className="h-10 border border-border bg-white px-3 text-sm">
            <option value="">Все статусы</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {error ? <p className="mt-6 border border-[#b42318]/30 bg-[#b42318]/5 px-3 py-2 text-sm text-[#8d1d15]" role="alert">{error}</p> : null}
        <div className="mt-6 overflow-x-auto border border-border">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f6f4] text-xs uppercase tracking-[0.08em] text-smoke"><tr><th className="px-4 py-3 font-medium">Креатор</th><th className="px-4 py-3 font-medium">Комиссия</th><th className="px-4 py-3 font-medium">Период</th><th className="px-4 py-3 font-medium">Статус</th><th className="px-4 py-3 font-medium">Причина</th></tr></thead>
            <tbody>
              {loading ? <TableSkeletonRows columns={5} /> : null}
              {!loading && !rows.length ? <tr><td colSpan={5} className="px-4 py-14 text-center text-smoke">Соглашений по выбранному фильтру нет.</td></tr> : null}
              {!loading ? rows.map(({ agreement, partner }) => <tr key={agreement.id} className="border-t border-border align-top hover:bg-[#fbfbfa]"><td className="px-4 py-4"><div className="font-medium">{partner.displayName}</div><div className="mt-1 text-xs text-smoke">{partner.creatorId ?? partner.email ?? "—"}</div></td><td className="px-4 py-4 font-medium">{agreement.commissionRate}%</td><td className="px-4 py-4 text-smoke">{formatDate(agreement.startsAt)}{agreement.endsAt ? ` — ${formatDate(agreement.endsAt)}` : " — без срока"}</td><td className="px-4 py-4"><span className={agreement.status === "active" ? "text-[#168044]" : "text-smoke"}>{statusLabels[agreement.status]}</span></td><td className="max-w-[360px] px-4 py-4 text-smoke">{agreement.reason}</td></tr>) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
