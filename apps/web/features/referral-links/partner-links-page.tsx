"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Check, Copy, Download, ExternalLink, Link2, Pencil, QrCode, X } from "lucide-react"
import Image from "next/image"
import { CreatorPageHeader } from "@/components/creator-dashboard/dashboard-ui"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type LinkType = "homepage" | "product" | "category" | "brand"
type LinkStatus = "active" | "revoked"
type ReferralLink = {
  id: string
  code: string
  label: string
  targetProtocol: "http" | "https"
  targetHost: string
  targetPath: string
  linkType: LinkType
  status: LinkStatus
  createdAt: string
  revokedAt: string | null
  expiresAt: string | null
  isExpired: boolean
  shortUrl: string
  targetUrl: string
}
type LinkResult = { links: ReferralLink[] }

const typeLabels: Record<LinkType, string> = {
  homepage: "Главная",
  product: "Товар",
  category: "Категория",
  brand: "Бренд",
}

const typeHints: Record<LinkType, string> = {
  homepage: "Главная страница или локализованная главная",
  product: "Страница товара в разделе products",
  category: "Страница категории в разделе categories",
  brand: "Страница бренда в разделе brands",
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(value))
}

export function PartnerLinksPage() {
  const [links, setLinks] = useState<ReferralLink[]>([])
  const [status, setStatus] = useState<"all" | LinkStatus>("all")
  const [linkType, setLinkType] = useState<LinkType>("homepage")
  const [targetUrl, setTargetUrl] = useState("")
  const [label, setLabel] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [qrLink, setQrLink] = useState<ReferralLink | null>(null)
  const [renameLink, setRenameLink] = useState<ReferralLink | null>(null)
  const [renameLabel, setRenameLabel] = useState("")
  const [renaming, setRenaming] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const query = status === "all" ? "" : `?status=${status}`
    try {
      const response = await fetch(`/api/partner/referral-links${query}`, { cache: "no-store" })
      const body = await response.json() as LinkResult & { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? "Не удалось загрузить ссылки.")
      setLinks(body.links)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить ссылки.")
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function createLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const bodyData: { linkType: LinkType; targetUrl: string; label?: string; expiresAt?: string } = { linkType, targetUrl }
      if (label.trim()) bodyData.label = label.trim()
      if (expiresAt) bodyData.expiresAt = new Date(expiresAt).toISOString()
      const response = await fetch("/api/partner/referral-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyData),
      })
      const body = await response.json() as { link?: ReferralLink; error?: { message?: string } }
      if (!response.ok || !body.link) throw new Error(body.error?.message ?? "Не удалось создать ссылку.")
      setTargetUrl("")
      setLabel("")
      setExpiresAt("")
      setLinks((current) => [body.link!, ...current])
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось создать ссылку.")
    } finally {
      setSaving(false)
    }
  }

  async function revokeLink(link: ReferralLink) {
    if (link.status === "revoked" || !window.confirm("Отозвать эту ссылку? Она перестанет перенаправлять на Vizaje-Nica.")) return
    setError(null)
    try {
      const response = await fetch(`/api/partner/referral-links/${link.id}/revoke`, { method: "PATCH" })
      const body = await response.json() as { link?: ReferralLink; error?: { message?: string } }
      if (!response.ok || !body.link) throw new Error(body.error?.message ?? "Не удалось отозвать ссылку.")
      setLinks((current) => current.map((item) => item.id === body.link!.id ? body.link! : item))
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Не удалось отозвать ссылку.")
    }
  }

  async function saveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!renameLink) return
    setRenaming(true)
    setError(null)
    try {
      const response = await fetch(`/api/partner/referral-links/${renameLink.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: renameLabel }),
      })
      const body = await response.json() as { link?: ReferralLink; error?: { message?: string } }
      if (!response.ok || !body.link) throw new Error(body.error?.message ?? "Не удалось переименовать ссылку.")
      setLinks((current) => current.map((item) => item.id === body.link!.id ? body.link! : item))
      setRenameLink(null)
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Не удалось переименовать ссылку.")
    } finally {
      setRenaming(false)
    }
  }

  async function copyLink(link: ReferralLink) {
    try {
      await navigator.clipboard.writeText(link.shortUrl)
      setCopiedId(link.id)
      window.setTimeout(() => setCopiedId((current) => current === link.id ? null : current), 1600)
    } catch {
      setError("Браузер не разрешил копирование. Скопируйте короткую ссылку вручную.")
    }
  }

  return (
    <section className="min-h-[calc(100vh-64px)] px-5 py-8 text-foreground sm:px-8 sm:py-10 lg:px-10">
      <div className="mx-auto max-w-[1120px]">
        <CreatorPageHeader eyebrow="Кабинет креатора" title="Мои ссылки" description="Создавайте короткие ссылки на разрешённые страницы Vizaje-Nica. Статистика кликов и заказов пока не подключена." />

        <form onSubmit={createLink} className="mt-7 border border-border bg-card p-5 sm:p-6">
          <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center border border-border bg-muted"><Link2 className="size-4" aria-hidden="true" /></div><div><h2 className="text-base font-medium">Новая ссылка</h2><p className="mt-1 text-xs text-muted-foreground">Только разрешённые hosts и RU/RO пути.</p></div></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[180px_1fr_220px]">
            <label className="block text-sm"><span className="font-medium">Тип</span><select value={linkType} onChange={(event) => setLinkType(event.target.value as LinkType)} className="mt-2 h-11 w-full border border-input bg-background px-3 text-sm outline-none focus:border-foreground">{Object.entries(typeLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
            <label className="block text-sm sm:col-span-2 lg:col-span-1"><span className="font-medium">Ссылка Vizaje-Nica</span><input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} className="mt-2 h-11 w-full border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground" placeholder="https://vizaje-nica.com/ro/" required /><span className="mt-2 block text-xs text-muted-foreground">{typeHints[linkType]}</span></label>
            <label className="block text-sm"><span className="font-medium">Внутреннее название</span><input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} className="mt-2 h-11 w-full border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground" placeholder="Например, сыворотка для лица" /><span className="mt-2 block text-xs text-muted-foreground">Не отображается в публичной ссылке.</span></label>
            <label className="block text-sm"><span className="font-medium">Срок действия</span><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-2 h-11 w-full border border-input bg-background px-3 text-sm outline-none focus:border-foreground" /><span className="mt-2 block text-xs text-muted-foreground">Необязательно; дата в прошлом не принимается.</span></label>
            <div className="flex items-end sm:col-span-2 lg:col-span-1"><button type="submit" disabled={saving} className="h-11 w-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85 disabled:opacity-50">{saving ? "Создаём..." : "Создать ссылку"}</button></div>
          </div>
        </form>

        <div className="mt-9 flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-medium tracking-[-0.02em]">Сохранённые ссылки</h2><p className="mt-1 text-xs text-muted-foreground">{links.length ? `${links.length} в этом списке` : "Список обновляется из базы данных"}</p></div><label className="flex items-center gap-3 text-sm text-muted-foreground"><span>Показать</span><select value={status} onChange={(event) => setStatus(event.target.value as "all" | LinkStatus)} aria-label="Фильтр ссылок" className="h-10 border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-foreground"><option value="all">Все</option><option value="active">Активные</option><option value="revoked">Отозванные</option></select></label></div>

        {error ? <p className="mt-5 border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
        <div className="mt-5 space-y-3">
          {loading ? <div className="border border-border px-4 py-12 text-center text-sm text-muted-foreground" role="status">Загрузка ссылок...</div> : null}
          {!loading && !links.length ? <div className="border border-border px-4 py-12 text-center text-sm text-muted-foreground">Создайте первую ссылку, чтобы начать.</div> : null}
          {!loading ? links.map((link) => {
            const available = link.status === "active" && !link.isExpired
            const statusLabel = link.status === "revoked" ? "Отозвана" : link.isExpired ? "Срок истёк" : "Активна"
            return (
              <article key={link.id} className="border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="max-w-full truncate text-base font-medium">{link.label}</h3>
                      <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{typeLabels[link.linkType]}</span>
                      <span className={`inline-flex items-center gap-2 text-xs ${available ? "text-[#15803d]" : "text-muted-foreground"}`}><span className={`size-2 rounded-full ${available ? "bg-[#15803d]" : "bg-muted-foreground/60"}`} />{statusLabel}</span>
                    </div>
                    <a href={link.targetUrl} target="_blank" rel="noreferrer" className="mt-3 flex max-w-full items-center gap-2 text-sm font-medium hover:underline"><span className="truncate">{link.targetHost}{link.targetPath}</span><ExternalLink className="size-3.5 shrink-0 text-muted-foreground" /></a>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>Создана {formatDate(link.createdAt)}</span>{link.expiresAt ? <span>{link.isExpired ? "Истекла" : "Истекает"} {formatDate(link.expiresAt)}</span> : null}<span className="font-mono">Код {link.code}</span></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <button type="button" onClick={() => { setRenameLink(link); setRenameLabel(link.label) }} className="inline-flex h-10 items-center gap-2 border border-border px-3 text-xs font-medium hover:bg-muted"><Pencil className="size-3.5" />Название</button>
                    <button type="button" onClick={() => void copyLink(link)} disabled={!available} className="inline-flex h-10 items-center gap-2 border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-40">{copiedId === link.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copiedId === link.id ? "Скопировано" : "Копировать"}</button>
                    <button type="button" onClick={() => setQrLink(link)} disabled={!available} className="inline-flex h-10 items-center gap-2 border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-40"><QrCode className="size-3.5" />QR</button>
                    {link.status === "active" ? <button type="button" onClick={() => void revokeLink(link)} className="inline-flex h-10 items-center gap-2 border border-destructive/30 px-3 text-xs font-medium text-destructive hover:bg-destructive/5"><X className="size-3.5" />Отозвать</button> : null}
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3 text-xs sm:flex-row sm:items-center sm:justify-between"><span className="text-muted-foreground">Короткая ссылка</span><a href={link.shortUrl} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-2 font-mono text-foreground hover:underline"><span className="truncate">{link.shortUrl}</span><ExternalLink className="size-3.5 shrink-0" /></a></div>
              </article>
            )
          }) : null}
        </div>
      </div>

      <QrDialog key={qrLink?.id ?? "qr-closed"} link={qrLink} onClose={() => setQrLink(null)} />
      <Dialog open={Boolean(renameLink)} onOpenChange={(open) => { if (!open && !renaming) setRenameLink(null) }}>
        <DialogContent className="border-border bg-background p-0 text-foreground sm:max-w-[440px]">
          <DialogHeader className="border-b border-border px-6 py-5 pr-14"><DialogTitle className="font-sans text-lg font-medium">Название ссылки</DialogTitle><DialogDescription className="text-sm text-muted-foreground">Это название видно только вам в кабинете.</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void saveRename(event)} className="px-6 py-5">
            <label className="block text-sm"><span className="font-medium">Название</span><input autoFocus required maxLength={80} value={renameLabel} onChange={(event) => setRenameLabel(event.target.value)} className="mt-2 h-11 w-full border border-input bg-background px-3 outline-none focus:border-foreground" /></label>
            <button type="submit" disabled={renaming} className="mt-5 h-11 w-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50">{renaming ? "Сохраняем..." : "Сохранить название"}</button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function QrDialog({ link, onClose }: { link: ReferralLink | null; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!link) return
    let active = true
    void (async () => {
      try {
        const { default: QRCode } = await import("qrcode")
        const url = await QRCode.toDataURL(link.shortUrl, { width: 280, margin: 1, errorCorrectionLevel: "M", color: { dark: "#121212", light: "#ffffff" } })
        if (active) setDataUrl(url)
      } catch {
        if (active) setError("Не удалось сгенерировать QR-код.")
      }
    })()
    return () => { active = false }
  }, [link])

  return (
    <Dialog open={Boolean(link)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="border-border bg-background p-0 text-foreground sm:max-w-[420px]">
        <DialogHeader className="border-b border-border px-6 py-5 pr-14"><DialogTitle className="font-sans text-lg font-medium">QR-код ссылки</DialogTitle><DialogDescription className="text-sm text-muted-foreground">Откройте или сохраните короткую ссылку для своей аудитории.</DialogDescription></DialogHeader>
        <div className="flex flex-col items-center gap-5 px-6 py-7">
          {dataUrl ? <Image src={dataUrl} alt={`QR-код для ${link?.label ?? "ссылки"}`} width={280} height={280} unoptimized className="size-[280px] border border-border" /> : <div className="flex size-[280px] items-center justify-center border border-border text-sm text-muted-foreground" role="status">{error ?? "Генерируем..."}</div>}
          <p className="max-w-full truncate font-mono text-xs text-muted-foreground">{link?.shortUrl}</p>
          {dataUrl ? <a href={dataUrl} download={`vizaje-${link?.code ?? "referral"}-qr.png`} className="inline-flex h-11 items-center gap-2 border border-border px-4 text-sm font-medium hover:bg-muted"><Download className="size-4" />Скачать PNG</a> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
