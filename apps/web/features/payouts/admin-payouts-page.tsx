"use client"

import { useCallback, useEffect, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { TableSkeletonRows } from "@/components/ui/page-skeletons"

type Payout = {
  payout: { id: string; amount: string; currency: string; status: "requested" | "approved" | "paid" | "rejected" | "cancelled"; requestedAt: string; rejectionReason: string | null }
  partner: { id: string; displayName: string; creatorId: string | null; email: string | null }
}

const statusLabels = { requested: "Запрошена", approved: "Одобрена", paid: "Выплачена", rejected: "Отклонена", cancelled: "Отменена" }

export function AdminPayoutsPage() {
  const [status, setStatus] = useState<"" | Payout["payout"]["status"]>("")
  const [rows, setRows] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const query = status ? `?status=${status}` : ""
    try {
      const response = await fetch(`/api/admin/payouts${query}`, { cache: "no-store" })
      const body = await response.json() as { payouts?: Payout[]; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? "Не удалось загрузить выплаты")
      setRows(body.payouts ?? [])
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить выплаты") } finally { setLoading(false) }
  }, [status])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  async function update(id: string, nextStatus: "approved" | "paid" | "rejected" | "cancelled") {
    const reason = nextStatus === "rejected" ? window.prompt("Причина отказа") : null
    if (nextStatus === "rejected" && !reason?.trim()) return
    setBusy(id); setError(null)
    const response = await fetch(`/api/admin/payouts/${id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: nextStatus, reason }) })
    const body = await response.json() as { error?: { message?: string } }
    setBusy(null)
    if (!response.ok) { setError(body.error?.message ?? "Не удалось изменить статус выплаты"); return }
    void load()
  }

  return <section className="min-h-[calc(100vh-64px)] bg-white px-5 py-8 sm:px-8 lg:px-10"><div className="mx-auto max-w-[1440px]"><div className="flex flex-col gap-3 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-4xl tracking-[-0.04em]">Выплаты</h1><p className="mt-3 text-sm leading-6 text-smoke">Обработка запросов креаторов с записью каждого решения в аудит.</p></div><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Фильтр выплат по статусу" className="h-10 border border-border bg-white px-3 text-sm"><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{error ? <p className="mt-6 border border-[#b42318]/30 bg-[#b42318]/5 px-3 py-2 text-sm text-[#8d1d15]" role="alert">{error}</p> : null}<div className="mt-6 overflow-x-auto border border-border"><table className="w-full min-w-[980px] border-collapse text-left text-sm"><thead className="bg-[#f6f6f4] text-xs uppercase tracking-[0.08em] text-smoke"><tr><th className="px-4 py-3 font-medium">Креатор</th><th className="px-4 py-3 font-medium">Сумма</th><th className="px-4 py-3 font-medium">Статус</th><th className="px-4 py-3 font-medium">Запрошена</th><th className="px-4 py-3" /></tr></thead><tbody>{loading ? <TableSkeletonRows columns={5} /> : null}{!loading && !rows.length ? <tr><td colSpan={5} className="px-4 py-14 text-center text-smoke">Запросов по выбранному фильтру нет.</td></tr> : null}{!loading ? rows.map(({ payout, partner }) => <tr key={payout.id} className="border-t border-border"><td className="px-4 py-4"><div className="font-medium">{partner.displayName}</div><div className="mt-1 text-xs text-smoke">{partner.creatorId ?? partner.email ?? "—"}</div></td><td className="px-4 py-4">{payout.amount} {payout.currency}</td><td className="px-4 py-4">{statusLabels[payout.status]}</td><td className="px-4 py-4 text-smoke">{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(payout.requestedAt))}</td><td className="px-4 py-4 text-right"><div className="flex justify-end gap-2">{payout.status === "requested" ? <><button type="button" disabled={busy === payout.id} onClick={() => void update(payout.id, "approved")} className="h-9 border border-border px-3 text-xs hover:bg-[#f6f6f4] disabled:opacity-50">Одобрить</button><button type="button" disabled={busy === payout.id} onClick={() => void update(payout.id, "rejected")} className="h-9 border border-[#b42318]/30 px-3 text-xs text-[#8d1d15] hover:bg-[#b42318]/5 disabled:opacity-50">Отклонить</button></> : null}{payout.status === "approved" ? <button type="button" disabled={busy === payout.id} onClick={() => void update(payout.id, "paid")} className="inline-flex h-9 items-center gap-2 bg-charcoal px-3 text-xs text-white disabled:opacity-50">{busy === payout.id ? <LoaderCircle className="size-3.5 animate-spin" /> : null}Отметить выплаченной</button> : null}</div></td></tr>) : null}</tbody></table></div></div></section>
}
