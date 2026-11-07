"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  ArrowRight,
  BadgeDollarSign,
  ExternalLink,
  Link2,
  MousePointer2,
  ReceiptText,
  Wallet,
} from "lucide-react"
import type { CreatorDashboardData } from "@/components/creator-dashboard/types"
import { useDashboardLocale } from "@/components/dashboard/dashboard-locale-provider"
import { CreatorDashboardSkeleton, InlineListSkeleton } from "@/components/ui/page-skeletons"
import type { DashboardCopy } from "@/lib/dashboard-translations"

type ReferralLink = {
  id: string
  code: string
  label: string
  targetProtocol: "http" | "https"
  targetHost: string
  targetPath: string
  linkType: "homepage" | "product" | "category" | "brand"
  status: "active" | "revoked"
  createdAt: string
  revokedAt: string | null
  expiresAt: string | null
  isExpired: boolean
  shortUrl: string
  targetUrl: string
}

type FinanceSummary = {
  clicks: number
  orders: number
  grossSales: string
  commission: string
  requestedPayout: string
  paidPayout: string
  availablePayout: string
  availableByCurrency: Array<{ currency: string; amount: string }>
}
type FinanceOrder = { id: string; orderId: string; amount: string; currency: string; commissionAmount: string; status: "confirmed" | "cancelled"; occurredAt: string; linkLabel: string }
type FinanceData = { summary: FinanceSummary; orders: FinanceOrder[] }

type LoadState = "loading" | "ready" | "error"

const numberFormat = new Intl.NumberFormat("ru-RU")
function formatDate(value: string, locale: "ru" | "ro") {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(date)
}

function formatBalances(balances: Array<{ currency: string; amount: string }>, fallback: string) {
  if (!balances.length) return fallback
  return balances.map((balance) => `${balance.amount} ${balance.currency}`).join(" · ")
}

function linkStatus(link: ReferralLink, copy: DashboardCopy["dashboard"]) {
  if (link.isExpired) return { label: copy.linkExpired, active: false }
  if (link.status === "revoked") return { label: copy.linkRevoked, active: false }
  return { label: copy.linkActive, active: true }
}

function LinkRows({ links, copy, locale }: { links: ReferralLink[]; copy: DashboardCopy["dashboard"]; locale: "ru" | "ro" }) {
  if (links.length === 0) {
    return (
      <div className="vp-empty-state">
        <strong>{copy.mobileLinks}</strong>
        <span>{copy.linksUnavailableNote}</span>
      </div>
    )
  }

  return (
    <div className="vp-link-list">
      {links.map((link) => {
        const status = linkStatus(link, copy)
        return (
          <div key={link.id} className="vp-link-row">
            <div className="vp-link-row-main">
              <span className="vp-link-name">{link.label}</span>
              <span className="vp-link-destination" title={link.targetUrl}>
                {link.targetHost}{link.targetPath} · {formatDate(link.createdAt, locale)}
              </span>
            </div>
            <div className="vp-link-row-actions">
              <span className={`vp-link-status${status.active ? " is-active" : ""}`}>{status.label}</span>
              <a className="vp-link-open" href={link.shortUrl} target="_blank" rel="noreferrer" aria-label={copy.linkOpen.replace("{label}", link.label)}>
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof ReceiptText
  label: string
  value: string | number
  hint: string
}) {
  return (
    <section className="vp-metric-card">
      <div className="vp-metric-label-row">
        <Icon className="vp-metric-icon size-[22px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className="vp-metric-value">{value}</p>
      <p className="vp-metric-hint">{hint}</p>
    </section>
  )
}

function MobileMetric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof MousePointer2
  label: string
  value: string | number
  hint: string
}) {
  return (
    <div className="vp-mobile-metric" aria-label={`${label}: ${value}. ${hint}`}>
      <Icon className="vp-mobile-metric-icon size-6" strokeWidth={1.8} aria-hidden="true" />
      <p className="vp-mobile-metric-label">{label}</p>
      <p className="vp-mobile-metric-value">{value}</p>
    </div>
  )
}

export default function CreatorDashboardPage() {
  const { copy, locale } = useDashboardLocale()
  const [dashboard, setDashboard] = useState<CreatorDashboardData | null>(null)
  const [dashboardState, setDashboardState] = useState<LoadState>("loading")
  const [referralLinks, setReferralLinks] = useState<ReferralLink[]>([])
  const [linksState, setLinksState] = useState<LoadState>("loading")
  const [finance, setFinance] = useState<FinanceData | null>(null)

  useEffect(() => {
    let current = true

    void fetch("/api/partner/dashboard", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("dashboard unavailable")
        return await response.json() as CreatorDashboardData
      })
      .then((data) => {
        if (!current) return
        setDashboard(data)
        setDashboardState("ready")
      })
      .catch(() => { if (current) setDashboardState("error") })

    void fetch("/api/partner/referral-links?status=all", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("links unavailable")
        return await response.json() as { links: ReferralLink[] }
      })
      .then((data) => {
        if (!current) return
        const sorted = [...data.links].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        setReferralLinks(sorted.slice(0, 3))
        setLinksState("ready")
      })
      .catch(() => { if (current) setLinksState("error") })

    void fetch("/api/partner/analytics", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("finance unavailable")
        return await response.json() as FinanceData
      })
      .then((data) => { if (current) setFinance(data) })
      .catch(() => { if (current) setFinance(null) })

    return () => { current = false }
  }, [])

  if (dashboardState === "loading") {
    return <CreatorDashboardSkeleton />
  }

  if (dashboardState === "error" || !dashboard) {
    return (
      <div className="vp-overview-page">
        <div className="vp-page-header">
          <div>
            <h1 className="vp-page-title">{copy.dashboard.title}</h1>
            <p className="vp-page-description">{copy.dashboard.linksUnavailable}</p>
          </div>
          <button type="button" className="vp-button" onClick={() => window.location.reload()}>{copy.dashboard.retry}</button>
        </div>
      </div>
    )
  }

  const { links } = dashboard
  const unavailableValue = "—"
  const balanceValue = finance ? formatBalances(finance.summary.availableByCurrency, finance.summary.availablePayout) : unavailableValue
  const conversionValue = finance && finance.summary.clicks > 0 ? `${((finance.summary.orders / finance.summary.clicks) * 100).toFixed(1)}%` : unavailableValue
  const numberOrDash = (value: number | undefined) => value === undefined ? unavailableValue : numberFormat.format(value)

  return (
    <div className="vp-overview-page">
      <header className="vp-page-header">
        <div>
          <h1 className="vp-page-title">{copy.dashboard.title}</h1>
          <p className="vp-page-description">{copy.dashboard.description}</p>
        </div>
        <Link href="/dashboard/links" className="vp-button">
          <Link2 className="size-4" aria-hidden="true" />{copy.dashboard.createLink}
        </Link>
      </header>

      <section className="vp-balance-card" aria-labelledby="available-balance-heading">
        <div className="vp-balance-copy">
          <p className="vp-balance-label" id="available-balance-heading">{copy.dashboard.availableBalance}</p>
          <p className="vp-balance-amount">{balanceValue}</p>
          <p className="vp-balance-note">{finance ? copy.finance.available : copy.dashboard.balanceNote}</p>
        </div>
        <div className="vp-balance-desktop-state">
          {copy.dashboard.balanceEmpty}
        </div>
        <div className="vp-balance-actions">
          <Link href="/dashboard/payouts" className="vp-button vp-button-dark-glass">
            <Wallet aria-hidden="true" />{copy.dashboard.payouts}
          </Link>
          <Link href="/dashboard/links" className="vp-button vp-button-light-glass">
            <Link2 aria-hidden="true" />{copy.dashboard.createLink}
          </Link>
        </div>
      </section>

      <section className="vp-section-grid" aria-label={copy.dashboard.keyMetrics}>
        <MetricCard icon={ReceiptText} label={copy.dashboard.confirmedOrders} value={numberOrDash(finance?.summary.orders)} hint={finance ? copy.finance.orders : copy.dashboard.ordersNotConnected} />
        <MetricCard icon={MousePointer2} label={copy.dashboard.conversion} value={conversionValue} hint={finance ? copy.finance.clicks : copy.dashboard.noClickData} />
        <MetricCard icon={Link2} label={copy.dashboard.activeLinks} value={numberFormat.format(links.active)} hint={`${numberFormat.format(links.total)} ${copy.dashboard.totalCreated}`} />
      </section>

      <section className="vp-mobile-metrics vp-surface-card" aria-label={copy.dashboard.keyMetrics}>
        <MobileMetric icon={MousePointer2} label={copy.dashboard.clicks} value={numberOrDash(finance?.summary.clicks)} hint={finance ? copy.finance.clicks : copy.dashboard.clicksNotConnected} />
        <MobileMetric icon={ReceiptText} label={copy.dashboard.orders} value={numberOrDash(finance?.summary.orders)} hint={finance ? copy.finance.orders : copy.dashboard.ordersNotConnected} />
        <MobileMetric icon={Link2} label={copy.dashboard.activeLinks} value={numberFormat.format(links.active)} hint={copy.dashboard.activeLinksCount} />
      </section>

      <section className="vp-surface-card vp-chart-card" aria-labelledby="rewards-chart-heading">
        <div className="vp-card-heading-row">
          <h2 className="vp-card-heading" id="rewards-chart-heading">{copy.dashboard.rewardsDynamics}</h2>
        </div>
        <div className="vp-chart-empty">{copy.dashboard.rewardsEmpty}</div>
      </section>

      <div className="vp-overview-lower-grid">
        <section className="vp-surface-card" aria-labelledby="recent-orders-heading">
          <h2 className="vp-card-heading" id="recent-orders-heading">{copy.dashboard.recentOrders}</h2>
          {finance?.orders.length ? <div className="vp-link-list">{finance.orders.slice(0, 3).map((order) => <div key={order.id} className="vp-link-row"><div className="vp-link-row-main"><span className="vp-link-name">{order.orderId}</span><span className="vp-link-destination">{order.linkLabel} · {new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "ru-RU", { dateStyle: "medium" }).format(new Date(order.occurredAt))}</span></div><div className="vp-link-row-actions"><span className="vp-link-status is-active">{order.amount} {order.currency}</span></div></div>)}</div> : <div className="vp-empty-state"><strong>{copy.dashboard.noData}</strong><span>{finance ? copy.finance.empty : copy.dashboard.ordersEmpty}</span></div>}
        </section>

        <section className="vp-surface-card" aria-labelledby="recent-links-heading">
          <div className="vp-card-heading-row">
            <h2 className="vp-card-heading" id="recent-links-heading">{copy.dashboard.recentLinks}</h2>
            <Link href="/dashboard/links" className="vp-card-link">{copy.dashboard.allLinks}<ArrowRight className="size-4" aria-hidden="true" /></Link>
          </div>
          {linksState === "loading" ? <InlineListSkeleton rows={3} /> : null}
          {linksState === "error" ? <div className="vp-empty-state"><strong>{copy.dashboard.linksUnavailable}</strong><span>{copy.dashboard.linksUnavailableNote}</span></div> : null}
          {linksState === "ready" ? <LinkRows links={referralLinks} copy={copy.dashboard} locale={locale} /> : null}
        </section>
      </div>

      <section className="vp-mobile-activity vp-surface-card" aria-labelledby="recent-activity-heading">
        <div className="vp-card-heading-row">
          <h2 className="vp-card-heading" id="recent-activity-heading">{copy.dashboard.recentActivity}</h2>
          <Link href="/dashboard/orders" className="vp-card-link">{copy.dashboard.all}<ArrowRight className="size-4" aria-hidden="true" /></Link>
        </div>
        <div className="vp-empty-state">
          <strong>{copy.dashboard.noActivity}</strong>
          <span>{copy.dashboard.activityEmpty}</span>
        </div>
      </section>

      <section className="vp-mobile-links vp-surface-card" aria-labelledby="mobile-recent-links-heading">
        <div className="vp-card-heading-row">
          <h2 className="vp-card-heading" id="mobile-recent-links-heading">{copy.dashboard.mobileLinks}</h2>
          <Link href="/dashboard/links" className="vp-card-link">{copy.dashboard.all}<ArrowRight className="size-4" aria-hidden="true" /></Link>
        </div>
        {linksState === "loading" ? <InlineListSkeleton rows={3} /> : null}
        {linksState === "error" ? <div className="vp-empty-state"><strong>{copy.dashboard.linksUnavailable}</strong><span>{copy.dashboard.mobileLinksUnavailableNote}</span></div> : null}
        {linksState === "ready" ? <LinkRows links={referralLinks} copy={copy.dashboard} locale={locale} /> : null}
      </section>

      <div className="vp-mobile-payout-link">
        <Link href="/dashboard/payouts"><BadgeDollarSign className="size-4" aria-hidden="true" />{copy.dashboard.payoutInfo}<ArrowRight className="size-4" aria-hidden="true" /></Link>
      </div>
    </div>
  )
}
