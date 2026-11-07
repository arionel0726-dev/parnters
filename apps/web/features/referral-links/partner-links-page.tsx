"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import Image from "next/image"
import {
  Check,
  ChevronRight,
  CircleDot,
  Copy,
  Download,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Pencil,
  QrCode,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { referralLinkCreateSchema, type ReferralLinkCreateInput } from "@vizaje/contracts"
import { CreatorPageHeader } from "@/components/creator-dashboard/dashboard-ui"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { CreatorLinksSkeleton } from "@/components/ui/page-skeletons"
import { useDashboardLocale } from "@/components/dashboard/dashboard-locale-provider"
import { dashboardTranslations, type DashboardCopy } from "@/lib/dashboard-translations"

type LinkType = ReferralLinkCreateInput["linkType"]
type LinkStatus = "active" | "revoked"
type StatusFilter = "all" | "active" | "revoked" | "expired"

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
  clicks: number
  orders: number
}

type LinkCopy = DashboardCopy["links"]
type ApiErrorBody = { error?: { message?: string } }

function formatDate(value: string, locale: "ru" | "ro") {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "ru-RU", { dateStyle: "medium" }).format(date)
}

function isLinkAvailable(link: ReferralLink) {
  return link.status === "active" && !link.isExpired
}

function shortPath(shortUrl: string, code: string) {
  try {
    return new URL(shortUrl).pathname || `/r/${code}`
  } catch {
    return shortUrl || `/r/${code}`
  }
}

function targetLocale(path: string) {
  const segment = path.split("/").find((value) => value === "ru" || value === "ro")
  return segment?.toUpperCase() ?? "RU/RO"
}

function linkStatusLabel(link: ReferralLink, copy: LinkCopy) {
  if (link.status === "revoked") return { label: copy.revoked, className: "is-revoked" }
  if (link.isExpired) return { label: copy.statusExpired, className: "is-expired" }
  return { label: copy.active, className: "is-active" }
}

async function readError(response: Response, fallback: string) {
  try {
    const body = await response.json() as ApiErrorBody
    return body.error?.message || fallback
  } catch {
    return fallback
  }
}

export function PartnerLinksPage() {
  const { locale, mode, copy } = useDashboardLocale()
  const linkCopy: LinkCopy = mode === "admin" ? dashboardTranslations.ru.creator.links : copy.links
  const [links, setLinks] = useState<ReferralLink[]>([])
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [typeFilter, setTypeFilter] = useState<"all" | LinkType>("all")
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [linkType, setLinkType] = useState<LinkType>("homepage")
  const [targetUrl, setTargetUrl] = useState("")
  const [label, setLabel] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createTargetInvalid, setCreateTargetInvalid] = useState(false)
  const [createdLink, setCreatedLink] = useState<ReferralLink | null>(null)

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [qrLink, setQrLink] = useState<ReferralLink | null>(null)
  const [renameLink, setRenameLink] = useState<ReferralLink | null>(null)
  const [renameLabel, setRenameLabel] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [revokeLink, setRevokeLink] = useState<ReferralLink | null>(null)
  const [revoking, setRevoking] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/partner/referral-links?status=all", { cache: "no-store" })
      if (!response.ok) throw new Error(await readError(response, linkCopy.loadError))
      const body = await response.json() as { links?: ReferralLink[] }
      if (!Array.isArray(body.links)) throw new Error(linkCopy.loadError)
      setLinks(body.links)
      setLoadState("ready")
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : linkCopy.loadError)
      setLoadState("error")
    }
  }, [linkCopy])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const counts = useMemo(() => ({
    total: links.length,
    active: links.filter((link) => isLinkAvailable(link)).length,
    revoked: links.filter((link) => link.status === "revoked").length,
  }), [links])

  const filteredLinks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale === "ro" ? "ro-RO" : "ru-RU")
    return links.filter((link) => {
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "active" && isLinkAvailable(link))
        || (statusFilter === "revoked" && link.status === "revoked")
        || (statusFilter === "expired" && link.status === "active" && link.isExpired)
      const matchesType = typeFilter === "all" || link.linkType === typeFilter
      if (!matchesStatus) return false
      if (!matchesType) return false
      if (!query) return true
      return [link.label, link.shortUrl, link.targetUrl, link.code].some((value) => value.toLocaleLowerCase(locale === "ro" ? "ro-RO" : "ru-RU").includes(query))
    })
  }, [links, locale, search, statusFilter, typeFilter])

  function resetCreateForm() {
    setLinkType("homepage")
    setTargetUrl("")
    setLabel("")
    setExpiresAt("")
    setCreateError(null)
    setCreateTargetInvalid(false)
  }

  async function createLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setCreateError(null)
    setCreateTargetInvalid(false)

    let expiry: string | undefined
    if (expiresAt) {
      const date = new Date(expiresAt)
      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        setCreateError(linkCopy.invalidExpiry)
        return
      }
      expiry = date.toISOString()
    }

    const payload = {
      linkType,
      targetUrl: targetUrl.trim(),
      requestedLocale: locale,
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(expiry ? { expiresAt: expiry } : {}),
    }
    const parsed = referralLinkCreateSchema.safeParse(payload)
    if (!parsed.success) {
      setCreateError(linkCopy.destinationError)
      setCreateTargetInvalid(true)
      return
    }

    setSaving(true)
    try {
      const response = await fetch("/api/partner/referral-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      })
      if (!response.ok) throw new Error(await readError(response, linkCopy.createError))
      const body = await response.json() as { link?: ReferralLink }
      if (!body.link) throw new Error(linkCopy.createError)
      setLinks((current) => [body.link!, ...current.filter((link) => link.id !== body.link!.id)])
      setCreatedLink(body.link)
      setCreateOpen(false)
      resetCreateForm()
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : linkCopy.createError)
      setCreateTargetInvalid(false)
    } finally {
      setSaving(false)
    }
  }

  async function copyLink(link: ReferralLink) {
    try {
      await navigator.clipboard.writeText(link.shortUrl)
      setCopiedId(link.id)
      window.setTimeout(() => setCopiedId((current) => current === link.id ? null : current), 1600)
    } catch {
      setActionError(linkCopy.copyError)
    }
  }

  async function saveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!renameLink || renaming) return
    setRenaming(true)
    setActionError(null)
    try {
      const response = await fetch(`/api/partner/referral-links/${renameLink.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: renameLabel.trim() }),
      })
      if (!response.ok) throw new Error(await readError(response, linkCopy.renameError))
      const body = await response.json() as { link?: ReferralLink }
      if (!body.link) throw new Error(linkCopy.renameError)
      setLinks((current) => current.map((link) => link.id === body.link!.id ? body.link! : link))
      setRenameLink(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : linkCopy.actionError)
    } finally {
      setRenaming(false)
    }
  }

  async function confirmRevoke() {
    if (!revokeLink || revoking || revokeLink.status === "revoked") return
    setRevoking(true)
    setActionError(null)
    try {
      const response = await fetch(`/api/partner/referral-links/${revokeLink.id}/revoke`, { method: "PATCH" })
      if (!response.ok) throw new Error(await readError(response, linkCopy.revokeError))
      const body = await response.json() as { link?: ReferralLink }
      if (!body.link) throw new Error(linkCopy.revokeError)
      setLinks((current) => current.map((link) => link.id === body.link!.id ? body.link! : link))
      setRevokeLink(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : linkCopy.actionError)
    } finally {
      setRevoking(false)
    }
  }

  function openCreate() {
    setActionError(null)
    resetCreateForm()
    setCreateOpen(true)
  }

  function statusText(link: ReferralLink) {
    return linkStatusLabel(link, linkCopy)
  }

  function actionButtons(link: ReferralLink, mobile = false) {
    const available = isLinkAvailable(link)
    const openRename = () => { setRenameLink(link); setRenameLabel(link.label); setActionError(null) }
    const openRevoke = () => { setRevokeLink(link); setActionError(null) }

    if (mobile) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className="partner-links-mobile-next" aria-label={`${linkCopy.tableActions}: ${link.label}`}><ChevronRight aria-hidden="true" /></button>} />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setQrLink(link)} disabled={!available}><QrCode aria-hidden="true" />{linkCopy.qr}</DropdownMenuItem>
            <DropdownMenuItem onClick={openRename}><Pencil aria-hidden="true" />{linkCopy.rename}</DropdownMenuItem>
            {link.status === "active" ? <DropdownMenuItem variant="destructive" onClick={openRevoke}><X aria-hidden="true" />{linkCopy.revoke}</DropdownMenuItem> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }

    return (
      <div className="partner-links-actions">
        <button type="button" className="partner-links-icon-button" onClick={() => void copyLink(link)} disabled={!available} aria-label={`${copiedId === link.id ? linkCopy.copied : linkCopy.copy}: ${link.shortUrl}`} title={copiedId === link.id ? linkCopy.copied : linkCopy.copy}>
          {copiedId === link.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </button>
        <button type="button" className="partner-links-icon-button" onClick={() => setQrLink(link)} disabled={!available} aria-label={`${linkCopy.qr}: ${link.label}`} title={linkCopy.qr}>
          <QrCode aria-hidden="true" />
        </button>
        <a className="partner-links-icon-button" href={link.shortUrl} target="_blank" rel="noreferrer" aria-label={linkCopy.openShortLink.replace("{label}", link.label)} title={linkCopy.openShortLink.replace("{label}", link.label)}>
          <ExternalLink aria-hidden="true" />
        </a>
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className="partner-links-icon-button" aria-label={`${linkCopy.tableActions}: ${link.label}`} title={linkCopy.tableActions}><MoreHorizontal aria-hidden="true" /></button>} />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={openRename}><Pencil aria-hidden="true" />{linkCopy.rename}</DropdownMenuItem>
            {link.status === "active" ? <DropdownMenuItem variant="destructive" onClick={openRevoke}><X aria-hidden="true" />{linkCopy.revoke}</DropdownMenuItem> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  const createAction = (
    <button type="button" className="vp-button partner-links-create-button" onClick={openCreate}>
      <Link2 aria-hidden="true" />{linkCopy.createAction}
    </button>
  )

  return (
    <section className="partner-links-page creator-dashboard-surface">
      <div className="partner-links-container">
        <CreatorPageHeader title={linkCopy.title} description={linkCopy.description} action={createAction} />

        <section className="partner-links-summary" aria-label={linkCopy.savedTitle}>
          <SummaryCard icon={Link2} label={linkCopy.summaryTotal} value={loadState === "ready" ? counts.total : "—"} />
          <SummaryCard icon={CircleDot} tone="active" label={linkCopy.summaryActive} value={loadState === "ready" ? counts.active : "—"} />
          <SummaryCard icon={CircleDot} tone="muted" label={linkCopy.summaryRevoked} value={loadState === "ready" ? counts.revoked : "—"} />
        </section>

        <div className="partner-links-toolbar">
          <label className="partner-links-search">
            <span className="sr-only">{linkCopy.searchPlaceholder}</span>
            <Search aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={linkCopy.searchPlaceholder} type="search" />
          </label>
          <div className="partner-links-filter-group partner-links-filter-desktop">
            <label className="partner-links-filter">
              <span className="sr-only">{linkCopy.filterType}</span>
              <select value={typeFilter} aria-label={linkCopy.filterType} onChange={(event) => setTypeFilter(event.target.value as "all" | LinkType)}>
                <option value="all">{linkCopy.typeAll}</option>
                {Object.entries(linkCopy.types).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </label>
            <label className="partner-links-filter">
              <span className="sr-only">{linkCopy.filterStatus}</span>
              <select value={statusFilter} aria-label={linkCopy.filterStatus} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="all">{linkCopy.statusAll}</option>
                <option value="active">{linkCopy.active}</option>
                <option value="revoked">{linkCopy.revoked}</option>
                <option value="expired">{linkCopy.statusExpired}</option>
              </select>
            </label>
          </div>
          <button type="button" className="partner-links-filter-trigger" onClick={() => setFiltersOpen(true)} aria-label={linkCopy.filtersTitle}>
            <SlidersHorizontal aria-hidden="true" />
          </button>
        </div>

        {actionError && !renameLink && !revokeLink ? <p className="partner-links-alert" role="alert">{actionError}</p> : null}

        {loadState === "loading" ? <CreatorLinksSkeleton /> : null}
        {loadState === "error" ? <div className="partner-links-state is-error" role="alert"><p>{loadError ?? linkCopy.loadError}</p><button type="button" className="vp-button" onClick={() => { setLoadState("loading"); setLoadError(null); void load() }}>{linkCopy.retry}</button></div> : null}
        {loadState === "ready" ? filteredLinks.length === 0 ? (
          <div className="partner-links-state">
            <p>{links.length === 0 ? linkCopy.empty : search.trim() ? linkCopy.searchEmpty : linkCopy.filteredEmpty}</p>
          </div>
        ) : (
          <>
            <div className="partner-links-table-wrap">
              <table className="partner-links-table">
                <thead><tr>
                  <th scope="col">{linkCopy.tableLabel}</th>
                  <th scope="col">{linkCopy.tableType}</th>
                  <th scope="col">{linkCopy.tableStatus}</th>
                  <th scope="col">{linkCopy.tableClicks}</th>
                  <th scope="col">{linkCopy.tableOrders}</th>
                  <th scope="col">{linkCopy.tableActions}</th>
                </tr></thead>
                <tbody>{filteredLinks.map((link) => {
                  const status = statusText(link)
                  return <tr key={link.id}>
                    <td className="partner-links-label-cell">
                      <strong title={link.label}>{link.label}</strong>
                      <a href={link.shortUrl} target="_blank" rel="noreferrer" aria-label={linkCopy.openShortLink.replace("{label}", link.label)} title={link.targetUrl}>
                        <span>{shortPath(link.shortUrl, link.code)}</span><ExternalLink aria-hidden="true" />
                      </a>
                    </td>
                    <td><span className="partner-links-type">{linkCopy.types[link.linkType]}</span></td>
                    <td><span className={`partner-links-status ${status.className}`}>{status.label}</span></td>
                    <td>{link.clicks}</td>
                    <td>{link.orders}</td>
                    <td>{actionButtons(link)}</td>
                  </tr>
                })}</tbody>
              </table>
            </div>
            <div className="partner-links-mobile-list">
              {filteredLinks.map((link) => {
                const status = statusText(link)
                return <article className="partner-links-card" key={link.id}>
                  <div className="partner-links-card-heading">
                    <div className="partner-links-card-title"><h2>{link.label}</h2><span className="partner-links-card-meta">{linkCopy.types[link.linkType]} · {targetLocale(link.targetPath)}</span></div>
                    <div className="partner-links-card-heading-actions"><span className={`partner-links-status ${status.className}`}>{status.label}</span>{actionButtons(link, true)}</div>
                  </div>
                  <div className="partner-links-card-short">
                    <a href={link.shortUrl} target="_blank" rel="noreferrer" aria-label={linkCopy.openShortLink.replace("{label}", link.label)}><span>{shortPath(link.shortUrl, link.code)}</span><ExternalLink aria-hidden="true" /></a>
                    <button type="button" className="partner-links-quick-copy" onClick={() => void copyLink(link)} disabled={!isLinkAvailable(link)} aria-label={`${copiedId === link.id ? linkCopy.copied : linkCopy.copy}: ${link.shortUrl}`}>
                      {copiedId === link.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copiedId === link.id ? linkCopy.copied : linkCopy.copy}
                    </button>
                  </div>
                  <div className="partner-links-card-footer"><span>{linkCopy.tableClicks}: {link.clicks}</span><span>{linkCopy.tableOrders}: {link.orders}</span></div>
                  {link.expiresAt ? <div className="partner-links-card-footer"><span>{(link.isExpired ? linkCopy.expired : linkCopy.expires).replace("{date}", formatDate(link.expiresAt, locale))}</span></div> : null}
                </article>
              })}
            </div>
          </>
        ) : null}
      </div>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="dialog-mobile-sheet partner-links-filter-dialog border-border bg-background p-0 text-foreground sm:max-w-[440px]">
          <DialogHeader className="border-b border-border px-5 py-5 pr-14 sm:px-6">
            <DialogTitle className="font-sans text-lg font-medium">{linkCopy.filtersTitle}</DialogTitle>
            <DialogDescription>{linkCopy.filtersDescription}</DialogDescription>
          </DialogHeader>
          <div className="partner-links-filter-dialog-form">
            <label className="partner-links-field"><span>{linkCopy.filterType}</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | LinkType)}><option value="all">{linkCopy.typeAll}</option>{Object.entries(linkCopy.types).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
            <label className="partner-links-field"><span>{linkCopy.filterStatus}</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">{linkCopy.statusAll}</option><option value="active">{linkCopy.active}</option><option value="revoked">{linkCopy.revoked}</option><option value="expired">{linkCopy.statusExpired}</option></select></label>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!saving) { setCreateOpen(open); if (!open) resetCreateForm() } }}>
        <DialogContent className="dialog-mobile-sheet partner-links-dialog border-border bg-background p-0 text-foreground sm:max-w-[720px]">
          <DialogHeader className="border-b border-border px-5 py-5 pr-14 sm:px-6">
            <DialogTitle className="font-sans text-lg font-medium">{linkCopy.newTitle}</DialogTitle>
            <DialogDescription>{linkCopy.newDescription}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void createLink(event)} className="partner-links-dialog-form">
            <label className="partner-links-field">
              <span>{linkCopy.type}</span>
              <select value={linkType} onChange={(event) => setLinkType(event.target.value as LinkType)}>
                {Object.entries(linkCopy.types).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </label>
            <label className="partner-links-field">
              <span>{linkCopy.targetUrl}</span>
              <input required type="url" inputMode="url" autoComplete="url" value={targetUrl} onChange={(event) => { setTargetUrl(event.target.value); if (createTargetInvalid) { setCreateTargetInvalid(false); setCreateError(null) } }} placeholder={linkCopy.targetPlaceholder} aria-invalid={createTargetInvalid ? "true" : undefined} aria-describedby={createTargetInvalid ? "partner-link-create-error" : "partner-link-type-hint"} />
              <small id="partner-link-type-hint">{linkCopy.typeHints[linkType]}</small>
            </label>
            <label className="partner-links-field">
              <span>{linkCopy.linkName}</span>
              <input maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} placeholder={linkCopy.linkNamePlaceholder} />
              <small>{linkCopy.linkNameNote}</small>
            </label>
            <label className="partner-links-field">
              <span>{linkCopy.expiresAt}</span>
              <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
              <small>{linkCopy.expiresAtNote}</small>
            </label>
            {createError ? <p className="partner-links-alert" id="partner-link-create-error" role="alert">{createError}</p> : null}
            <button type="submit" className="vp-button partner-links-submit" disabled={saving}>
              {saving ? linkCopy.creating : linkCopy.create}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(createdLink)} onOpenChange={(open) => { if (!open) setCreatedLink(null) }}>
        <DialogContent className="dialog-mobile-sheet partner-links-dialog border-border bg-background p-0 text-foreground sm:max-w-[480px]">
          <DialogHeader className="border-b border-border px-5 py-5 pr-14 sm:px-6">
            <DialogTitle className="font-sans text-lg font-medium">{linkCopy.createdTitle}</DialogTitle>
            <DialogDescription>{linkCopy.createdDescription}</DialogDescription>
          </DialogHeader>
          {createdLink ? <div className="partner-links-created-content">
            <p className="partner-links-result-url">{createdLink.shortUrl}</p>
            <QrCodePanel link={createdLink} copy={linkCopy} />
            <div className="partner-links-result-actions">
              <button type="button" className="vp-button" onClick={() => void copyLink(createdLink)}>
                {copiedId === createdLink.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copiedId === createdLink.id ? linkCopy.copied : linkCopy.copy}
              </button>
              <button type="button" className="vp-button partner-links-secondary-button" onClick={() => { setCreatedLink(null); openCreate() }}>{linkCopy.createAnother}</button>
            </div>
          </div> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(qrLink)} onOpenChange={(open) => { if (!open) setQrLink(null) }}>
        <DialogContent className="dialog-mobile-sheet partner-links-dialog border-border bg-background p-0 text-foreground sm:max-w-[440px]">
          <DialogHeader className="border-b border-border px-5 py-5 pr-14 sm:px-6">
            <DialogTitle className="font-sans text-lg font-medium">{linkCopy.qrTitle}</DialogTitle>
            <DialogDescription>{linkCopy.qrDescription}</DialogDescription>
          </DialogHeader>
          {qrLink ? <QrCodePanel link={qrLink} copy={linkCopy} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renameLink)} onOpenChange={(open) => { if (!open && !renaming) setRenameLink(null) }}>
        <DialogContent className="dialog-mobile-sheet partner-links-dialog border-border bg-background p-0 text-foreground sm:max-w-[440px]">
          <DialogHeader className="border-b border-border px-5 py-5 pr-14 sm:px-6">
            <DialogTitle className="font-sans text-lg font-medium">{linkCopy.renameTitle}</DialogTitle>
            <DialogDescription>{linkCopy.renameDescription}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void saveRename(event)} className="partner-links-dialog-form">
            <label className="partner-links-field"><span>{linkCopy.linkName}</span><input autoFocus required maxLength={80} value={renameLabel} onChange={(event) => setRenameLabel(event.target.value)} /></label>
            {actionError ? <p className="partner-links-alert" role="alert">{actionError}</p> : null}
            <button type="submit" className="vp-button partner-links-submit" disabled={renaming}>{renaming ? linkCopy.saving : linkCopy.saveName}</button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(revokeLink)} onOpenChange={(open) => { if (!open && !revoking) setRevokeLink(null) }}>
        <DialogContent className="dialog-mobile-sheet partner-links-dialog border-border bg-background p-0 text-foreground sm:max-w-[440px]">
          <DialogHeader className="border-b border-border px-5 py-5 pr-14 sm:px-6">
            <DialogTitle className="font-sans text-lg font-medium">{linkCopy.revokeTitle}</DialogTitle>
            <DialogDescription>{linkCopy.revokeDescription}</DialogDescription>
          </DialogHeader>
          {actionError ? <p className="partner-links-alert partner-links-dialog-inline-alert" role="alert">{actionError}</p> : null}
          <div className="partner-links-dialog-actions">
            <button type="button" className="vp-button partner-links-secondary-button" onClick={() => setRevokeLink(null)} disabled={revoking}>{linkCopy.cancel}</button>
            <button type="button" className="vp-button partner-links-revoke-button" onClick={() => void confirmRevoke()} disabled={revoking}>{revoking ? linkCopy.saving : linkCopy.confirmRevoke}</button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function SummaryCard({ icon: Icon, tone = "default", label, value }: { icon: typeof Link2; tone?: "default" | "active" | "muted"; label: string; value: number | string }) {
  return <section className="partner-links-summary-card"><div className={`partner-links-summary-icon is-${tone}`}><Icon aria-hidden="true" /></div><span>{label}</span><strong>{value}</strong></section>
}

function QrCodePanel({ link, copy }: { link: ReferralLink; copy: LinkCopy }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { default: QRCode } = await import("qrcode")
        const result = await QRCode.toDataURL(link.shortUrl, {
          width: 280,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#111111", light: "#ffffff" },
        })
        if (active) setDataUrl(result)
      } catch {
        if (active) setFailed(true)
      }
    })()
    return () => { active = false }
  }, [link.shortUrl])

  return (
    <div className="partner-links-qr-content">
      {dataUrl ? <Image src={dataUrl} alt={copy.qrAlt.replace("{label}", link.label)} width={280} height={280} unoptimized className="partner-links-qr-image" /> : <div className="partner-links-qr-placeholder" role="status">{failed ? copy.qrError : copy.generating}</div>}
      <p className="partner-links-qr-url" title={link.shortUrl}>{link.shortUrl}</p>
      {dataUrl ? <a className="vp-button partner-links-download" href={dataUrl} download={`vizaje-${link.code}-qr.png`}><Download aria-hidden="true" />{copy.download}</a> : null}
    </div>
  )
}
