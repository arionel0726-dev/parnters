"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, Check, ChevronRight, Copy, ExternalLink, LoaderCircle, RotateCw, Search } from "lucide-react"
import type { ApplicationAudienceSize } from "./audience-sizes"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TableSkeletonRows } from "@/components/ui/page-skeletons"
import { ReadMoreText } from "@/components/ui/read-more-text"
import { cn } from "@/lib/utils"

type Application = {
  id: string
  fullName: string
  email: string
  phone: string
  dateOfBirth: string
  audienceSize: ApplicationAudienceSize | null
  instagram: string | null
  tiktok: string | null
  otherSocial: string | null
  partnershipFormat: "blogger_influencer" | "ugc_creator" | "both" | null
  contentDescription: string | null
  partnershipReason: string | null
  introduction: string
  status: "pending" | "approved" | "rejected"
  partnerId: string | null
  createdAt: string
  updatedAt: string
}

type Review = { id: string; action: "approved" | "rejected"; reason: string | null; createdAt: string; reviewer: { id: string; name: string | null; email: string } | null }
type ApplicationResult = { rows: Application[]; total: number; page: number; pageSize: number }
type EmailDelivery = {
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
type DetailResult = { application: Application; reviews: Review[]; emailDeliveries: EmailDelivery[] }

const statusLabels = { pending: "На рассмотрении", approved: "Одобрена", rejected: "Отклонена" }
const statusStyles: Record<Application["status"], { badge: string; dot: string; tab: string; hover: string }> = {
  pending: {
    badge: "border-[#d4d4d4] bg-[#f3f3f3] text-[#666666]",
    dot: "bg-[#8a8a8a]",
    tab: "bg-[#e9e9e9] text-[#444444]",
    hover: "hover:bg-[#f4f4f4]",
  },
  approved: {
    badge: "border-[#168044]/20 bg-[#eaf6ee] text-[#168044]",
    dot: "bg-[#168044]",
    tab: "bg-[#eaf6ee] text-[#168044]",
    hover: "hover:bg-[#f2faf4]",
  },
  rejected: {
    badge: "border-[#b42318]/20 bg-[#fdf0ef] text-[#8d1d15]",
    dot: "bg-[#b42318]",
    tab: "bg-[#fdf0ef] text-[#8d1d15]",
    hover: "hover:bg-[#fdf5f4]",
  },
}
const audienceSizeLabels: Record<ApplicationAudienceSize, string> = {
  under_1000: "До 1 000 подписчиков",
  "1000_5000": "1 000–5 000 подписчиков",
  "5000_10000": "5 000–10 000 подписчиков",
  "10000_50000": "10 000–50 000 подписчиков",
  "50000_100000": "50 000–100 000 подписчиков",
  over_100000: "Более 100 000 подписчиков",
}
const partnershipFormatLabels = {
  blogger_influencer: "Блогер / инфлюенсер",
  ugc_creator: "UGC-креатор",
  both: "Оба формата",
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(value))
}

function StatusMark({ status }: { status: Application["status"] }) {
  return <span className={cn("inline-flex items-center gap-2 border px-2 py-1 text-xs", statusStyles[status].badge)}><span className={cn("size-2 rounded-full", statusStyles[status].dot)} />{statusLabels[status]}</span>
}

function safeProfileUrl(value: string) {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(candidate)
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".") && !url.username && !url.password
      ? url.toString()
      : null
  } catch {
    return null
  }
}

async function readJson<T>(response: Response) {
  return (await response.json().catch(() => null)) as T
}

export function ApplicationsPage() {
  const [status, setStatus] = useState<Application["status"]>("pending")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [result, setResult] = useState<ApplicationResult | null>(null)
  const [selected, setSelected] = useState<DetailResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadApplications = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ status, page: "1", pageSize: "25" })
    if (query) params.set("search", query)
    try {
      const response = await fetch(`/api/admin/applications?${params}`, { cache: "no-store" })
      const body = await readJson<ApplicationResult & { error?: { message?: string } }>(response)
      if (!response.ok) throw new Error(body.error?.message ?? "Не удалось загрузить заявки")
      setResult(body)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить заявки")
    } finally {
      setLoading(false)
    }
  }, [query, status])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadApplications() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadApplications])

  async function openApplication(id: string, status?: Application["status"]) {
    if (status === "pending") {
      const reviewResponse = await fetch(`/api/admin/applications/${id}/start-review`, { method: "POST" })
      if (!reviewResponse.ok && reviewResponse.status !== 403) {
        const body = await readJson<{ error?: { message?: string } }>(reviewResponse)
        setError(body.error?.message ?? "Не удалось начать рассмотрение заявки")
        return
      }
    }
    const response = await fetch(`/api/admin/applications/${id}`, { cache: "no-store" })
    const body = await readJson<DetailResult & { error?: { message?: string } }>(response)
    if (!response.ok) {
      setError(body.error?.message ?? "Не удалось загрузить заявку")
      return
    }
    setSelected(body)
  }

  return (
    <section className="min-h-[calc(100vh-64px)] bg-white px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl tracking-[-0.04em]">Заявки креаторов</h1>
          </div>
          <Link href="/app/partners" className="inline-flex h-10 items-center justify-center gap-2 border border-border px-4 text-sm font-medium hover:bg-[#f6f6f4]"><ArrowLeft className="size-4" />Партнёры</Link>
        </div>

        <div className="mt-7 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full max-w-[480px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-smoke" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setQuery(search.trim()) }} placeholder="Поиск по имени или email" aria-label="Поиск заявок" className="h-10 w-full rounded-none border border-border pl-10 pr-3 text-sm outline-none placeholder:text-smoke focus:border-ink" />
          </label>
          <div className="flex items-center gap-1 border-x border-b border-border p-1" role="tablist" aria-label="Статус заявки">
            {(["pending", "approved", "rejected"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={status === value} onClick={() => setStatus(value)} className={cn("inline-flex h-8 items-center gap-2 px-3 text-xs transition-colors", status === value ? statusStyles[value].tab : cn("text-smoke", statusStyles[value].hover))}><span className={cn("size-2 rounded-full", statusStyles[value].dot)} />{statusLabels[value]}</button>)}
          </div>
        </div>

        {error ? <p className="mt-6 border border-[#b42318]/30 bg-[#b42318]/5 px-3 py-2 text-sm text-[#8d1d15]" role="alert">{error}</p> : null}
        <div className="mt-6 overflow-x-auto border border-border">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f6f4] text-xs uppercase tracking-[0.08em] text-smoke"><tr><th className="px-4 py-3 font-medium">Заявитель</th><th className="px-4 py-3 font-medium">Соцсети</th><th className="px-4 py-3 font-medium">Получена</th><th className="px-4 py-3 font-medium">Статус</th><th className="px-4 py-3" /></tr></thead>
            <tbody>
              {loading ? <TableSkeletonRows columns={5} rows={6} /> : null}
              {!loading && !result?.rows.length ? <tr><td colSpan={5} className="px-4 py-14 text-center text-smoke">Заявок со статусом «{statusLabels[status].toLowerCase()}» нет.</td></tr> : null}
              {!loading ? result?.rows.map((application) => <tr key={application.id} className="border-t border-border hover:bg-[#fbfbfa]"><td className="px-4 py-4"><div className="font-medium">{application.fullName}</div><div className="mt-1 text-xs text-smoke">{application.email}</div></td><td className="px-4 py-4 text-smoke">{[application.instagram, application.tiktok, application.otherSocial].filter(Boolean).join(" · ") || "—"}</td><td className="px-4 py-4 text-smoke">{formatDate(application.createdAt)}</td><td className="px-4 py-4"><StatusMark status={application.status} /></td><td className="px-4 py-4 text-right"><button type="button" onClick={() => void openApplication(application.id, application.status)} className="inline-flex size-8 items-center justify-center border border-border hover:bg-[#f6f6f4]" aria-label={`Открыть ${application.fullName}`}><ChevronRight className="size-4" /></button></td></tr>) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-smoke">{result ? `${result.total} ${result.total === 1 ? "заявка" : "заявок"}` : ""}</p>
      </div>

      <ApplicationReviewDialog detail={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); void loadApplications() }} onRefresh={() => { if (selected) void openApplication(selected.application.id, selected.application.status) }} />
    </section>
  )
}

function ApplicationReviewDialog({ detail, onClose, onChanged, onRefresh }: { detail: DetailResult | null; onClose: () => void; onChanged: () => void; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState("")
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [copiedSocial, setCopiedSocial] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  async function retryDelivery(deliveryId: string) {
    if (!detail) return
    setRetryingId(deliveryId)
    setDialogError(null)
    const response = await fetch(`/api/admin/applications/${detail.application.id}/email-deliveries/${deliveryId}/retry`, { method: "POST" })
    const body = await readJson<{ error?: { message?: string } }>(response)
    setRetryingId(null)
    if (!response.ok) {
      setDialogError(body.error?.message ?? "Не удалось повторить отправку письма")
      return
    }
    onRefresh()
  }

  async function copySocial(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedSocial(value)
      window.setTimeout(() => setCopiedSocial((current) => current === value ? null : current), 1500)
    } catch {
      setDialogError("Не удалось скопировать ссылку на соцсеть")
    }
  }

  async function review(action: "approve" | "reject") {
    setBusy(true)
    setDialogError(null)
    const response = await fetch(`/api/admin/applications/${detail?.application.id}/${action}`, { method: "POST", headers: action === "reject" ? { "content-type": "application/json" } : undefined, body: action === "reject" ? JSON.stringify({ reason }) : undefined })
    const body = await readJson<{ error?: { message?: string } }>(response)
    setBusy(false)
    if (!response.ok) {
      setDialogError(body.error?.message ?? "Не удалось обновить заявку")
      return
    }
    onChanged()
  }

  return (
    <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="application-dialog-scroll max-h-[calc(100vh-2rem)] overflow-x-hidden overflow-y-auto rounded-none border-border bg-white p-0 text-ink sm:max-w-[720px]">
        {detail ? <>
          <DialogHeader className="border-b border-border px-6 py-5 pr-14"><DialogTitle className="font-sans text-lg font-medium">{detail.application.fullName}</DialogTitle><DialogDescription className="text-sm text-smoke">Получена {formatDate(detail.application.createdAt)} · {detail.application.email}</DialogDescription></DialogHeader>
          <div className="grid gap-7 px-6 py-6 sm:grid-cols-2">
            <div className="min-w-0 space-y-5 text-sm"><div><p className="text-xs uppercase tracking-[0.1em] text-smoke">Контакты</p><p className="mt-2">{detail.application.phone}</p><p className="mt-1 text-smoke">{detail.application.dateOfBirth}</p></div><div><p className="text-xs uppercase tracking-[0.1em] text-smoke">Размер аудитории</p><p className="mt-2">{detail.application.audienceSize ? audienceSizeLabels[detail.application.audienceSize] : "Не указан"}</p></div><div><p className="text-xs uppercase tracking-[0.1em] text-smoke">Социальные профили</p><div className="mt-2 space-y-2">{[detail.application.instagram, detail.application.tiktok, detail.application.otherSocial].filter((social): social is string => Boolean(social)).map((social, index) => {
              const href = safeProfileUrl(social.trim())
              const copied = copiedSocial === social

              return <div key={`${social}-${index}`} className="flex min-w-0 items-start gap-2">
                <button type="button" onClick={() => void copySocial(social)} className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center border border-border text-smoke hover:bg-[#f6f6f4] hover:text-ink" aria-label={copied ? "Ссылка скопирована" : "Скопировать ссылку на профиль"} title={copied ? "Скопировано" : "Копировать ссылку"}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button>
                {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-start gap-1 break-all text-ink underline decoration-border underline-offset-2 hover:decoration-ink"><span className="min-w-0 break-all">{social}</span><ExternalLink className="mt-1 size-3.5 shrink-0 text-smoke" aria-hidden="true" /></a> : <span className="min-w-0 break-all text-ink">{social}</span>}
              </div>
            })}</div></div></div>
            <div className="space-y-5">
              <div><p className="text-xs uppercase tracking-[0.1em] text-smoke">Формат сотрудничества</p><p className="mt-2">{detail.application.partnershipFormat ? partnershipFormatLabels[detail.application.partnershipFormat] : "Не указан"}</p></div>
              <div><p className="text-xs uppercase tracking-[0.1em] text-smoke">Создаваемый контент</p><ReadMoreText title="Создаваемый контент" text={detail.application.contentDescription || detail.application.introduction} className="mt-2 text-sm leading-6 text-ink" /></div>
              {detail.application.partnershipReason ? <div><p className="text-xs uppercase tracking-[0.1em] text-smoke">Почему Vizaje-Nica</p><ReadMoreText title="Почему Vizaje-Nica" text={detail.application.partnershipReason} className="mt-2 text-sm leading-6 text-ink" /></div> : null}
            </div>
          </div>
          <div className="border-t border-border px-6 py-5"><p className="text-xs uppercase tracking-[0.1em] text-smoke">Email-уведомления</p>{detail.emailDeliveries.length ? <div className="mt-3 divide-y divide-border">{detail.emailDeliveries.map((delivery) => <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0"><div><p className="font-medium">{{ submitted: "Заявка получена", in_review: "Рассмотрение начато", approved: "Заявка одобрена", rejected: "Заявка отклонена" }[delivery.eventType]}</p><p className="mt-1 text-xs text-smoke">{delivery.status} · попыток: {delivery.attemptCount}{delivery.sentAt ? ` · отправлено ${formatDate(delivery.sentAt)}` : ""}</p>{delivery.providerMessageId ? <p className="mt-1 break-all text-xs text-smoke">ID провайдера: {delivery.providerMessageId}</p> : null}{delivery.lastError ? <p className="mt-1 text-xs text-[#8d1d15]">{delivery.lastError}</p> : null}</div>{delivery.status === "failed" ? <button type="button" disabled={retryingId === delivery.id} onClick={() => void retryDelivery(delivery.id)} className="inline-flex h-9 items-center gap-2 border border-border px-3 text-xs hover:bg-[#f6f6f4] disabled:opacity-50">{retryingId === delivery.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}Повторить отправку</button> : null}</div>)}</div> : <p className="mt-3 text-sm text-smoke">В очереди нет уведомлений.</p>}</div>
          {detail.application.status === "pending" ? <DialogFooter className="dialog-footer-contained rounded-none border-t border-border bg-white p-6"><div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><label className="min-w-0 flex-1 text-sm"><span className="font-medium">Причина отказа (будет отправлена заявителю)</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Обязательна при отказе; будет видна заявителю" className="mt-2 h-10 w-full rounded-none border border-border px-3 text-sm outline-none placeholder:text-smoke focus:border-ink" /></label><div className="flex shrink-0 gap-2"><button type="button" disabled={busy} onClick={() => void review("reject")} className="h-10 border border-[#b42318]/40 px-4 text-sm text-[#8d1d15] hover:bg-[#b42318]/5 disabled:opacity-50">Отклонить</button><button type="button" disabled={busy} onClick={() => void review("approve")} className="h-10 bg-charcoal px-4 text-sm font-medium text-white hover:opacity-85 disabled:opacity-50">Одобрить</button></div></div>{dialogError ? <p className="mt-3 w-full text-xs text-[#8d1d15]" role="alert">{dialogError}</p> : null}</DialogFooter> : null}
        </> : null}
      </DialogContent>
    </Dialog>
  )
}

