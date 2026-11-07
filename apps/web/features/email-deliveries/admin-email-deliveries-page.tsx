"use client"

import { useCallback, useEffect, useState } from "react"
import { LoaderCircle, RotateCw } from "lucide-react"
import { TableSkeletonRows } from "@/components/ui/page-skeletons"

type Delivery = {
  delivery: {
    id: string
    eventType: "submitted" | "in_review" | "approved" | "rejected"
    status: "queued" | "sending" | "sent" | "failed"
    attemptCount: number
    nextAttemptAt: string
    lastAttemptAt: string | null
    sentAt: string | null
    providerMessageId: string | null
    lastError: string | null
    createdAt: string
  }
  application: { id: string; fullName: string; email: string; status: string }
}

const eventLabels = { submitted: "Заявка получена", in_review: "Рассмотрение начато", approved: "Заявка одобрена", rejected: "Заявка отклонена" }
const statusLabels = { queued: "В очереди", sending: "Отправляется", sent: "Отправлено", failed: "Ошибка" }

export function AdminEmailDeliveriesPage() {
  const [status, setStatus] = useState<"" | Delivery["delivery"]["status"]>("")
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const query = status ? `?status=${status}` : ""
    try {
      const response = await fetch(`/api/admin/email-deliveries${query}`, { cache: "no-store" })
      const body = await response.json() as { deliveries?: Delivery[]; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? "Не удалось загрузить email-очередь")
      setDeliveries(body.deliveries ?? [])
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить email-очередь") } finally { setLoading(false) }
  }, [status])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  async function retry(id: string) {
    setRetrying(id); setError(null)
    const response = await fetch(`/api/admin/email-deliveries/${id}/retry`, { method: "POST" })
    const body = await response.json() as { error?: { message?: string } }
    setRetrying(null)
    if (!response.ok) { setError(body.error?.message ?? "Не удалось повторить отправку"); return }
    void load()
  }

  return <section className="min-h-[calc(100vh-64px)] bg-white px-5 py-8 sm:px-8 lg:px-10"><div className="mx-auto max-w-[1440px]"><div className="flex flex-col gap-3 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-4xl tracking-[-0.04em]">Email-очередь</h1><p className="mt-3 text-sm leading-6 text-smoke">Контроль писем по заявкам, попыток и безопасных повторов отправки.</p></div><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Фильтр email по статусу" className="h-10 border border-border bg-white px-3 text-sm"><option value="">Все статусы</option><option value="queued">В очереди</option><option value="sending">Отправляется</option><option value="sent">Отправлено</option><option value="failed">Ошибка</option></select></div>{error ? <p className="mt-6 border border-[#b42318]/30 bg-[#b42318]/5 px-3 py-2 text-sm text-[#8d1d15]" role="alert">{error}</p> : null}<div className="mt-6 overflow-x-auto border border-border"><table className="w-full min-w-[980px] border-collapse text-left text-sm"><thead className="bg-[#f6f6f4] text-xs uppercase tracking-[0.08em] text-smoke"><tr><th className="px-4 py-3 font-medium">Получатель</th><th className="px-4 py-3 font-medium">Событие</th><th className="px-4 py-3 font-medium">Статус</th><th className="px-4 py-3 font-medium">Попытки</th><th className="px-4 py-3 font-medium">Ошибка</th><th className="px-4 py-3" /></tr></thead><tbody>{loading ? <TableSkeletonRows columns={6} /> : null}{!loading && !deliveries.length ? <tr><td colSpan={6} className="px-4 py-14 text-center text-smoke">Писем по выбранному фильтру нет.</td></tr> : null}{!loading ? deliveries.map(({ delivery, application }) => <tr key={delivery.id} className="border-t border-border"><td className="px-4 py-4"><div className="font-medium">{application.fullName}</div><div className="mt-1 text-xs text-smoke">{application.email}</div></td><td className="px-4 py-4">{eventLabels[delivery.eventType]}</td><td className="px-4 py-4">{statusLabels[delivery.status]}</td><td className="px-4 py-4">{delivery.attemptCount}</td><td className="max-w-[360px] px-4 py-4 text-xs text-[#8d1d15]">{delivery.lastError ?? "—"}</td><td className="px-4 py-4 text-right">{delivery.status === "failed" ? <button type="button" disabled={retrying === delivery.id} onClick={() => void retry(delivery.id)} className="inline-flex h-9 items-center gap-2 border border-border px-3 text-xs hover:bg-[#f6f6f4] disabled:opacity-50">{retrying === delivery.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}Повторить</button> : null}</td></tr>) : null}</tbody></table></div></div></section>
}
