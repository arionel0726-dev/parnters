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

type LoadState = "loading" | "ready" | "error"

const numberFormat = new Intl.NumberFormat("ru-RU")
const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" })

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date)
}

function linkStatus(link: ReferralLink) {
  if (link.isExpired) return { label: "Истекла", active: false }
  if (link.status === "revoked") return { label: "Отозвана", active: false }
  return { label: "Активна", active: true }
}

function LinkRows({ links }: { links: ReferralLink[] }) {
  if (links.length === 0) {
    return (
      <div className="vp-empty-state">
        <strong>Ссылок пока нет</strong>
        <span>Создайте первую ссылку на товар, категорию или бренд.</span>
      </div>
    )
  }

  return (
    <div className="vp-link-list">
      {links.map((link) => {
        const status = linkStatus(link)
        return (
          <div key={link.id} className="vp-link-row">
            <div className="vp-link-row-main">
              <span className="vp-link-name">{link.label}</span>
              <span className="vp-link-destination" title={link.targetUrl}>
                {link.targetHost}{link.targetPath} · {formatDate(link.createdAt)}
              </span>
            </div>
            <div className="vp-link-row-actions">
              <span className={`vp-link-status${status.active ? " is-active" : ""}`}>{status.label}</span>
              <a className="vp-link-open" href={link.shortUrl} target="_blank" rel="noreferrer" aria-label={`Открыть ссылку «${link.label}» в новой вкладке`}>
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
  const [dashboard, setDashboard] = useState<CreatorDashboardData | null>(null)
  const [dashboardState, setDashboardState] = useState<LoadState>("loading")
  const [referralLinks, setReferralLinks] = useState<ReferralLink[]>([])
  const [linksState, setLinksState] = useState<LoadState>("loading")

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

    return () => { current = false }
  }, [])

  if (dashboardState === "loading") {
    return <div className="vp-overview-page vp-overview-loading" role="status">Загружаем обзор кабинета…</div>
  }

  if (dashboardState === "error" || !dashboard) {
    return (
      <div className="vp-overview-page">
        <div className="vp-page-header">
          <div>
            <h1 className="vp-page-title">Обзор</h1>
            <p className="vp-page-description">Не удалось загрузить данные кабинета.</p>
          </div>
          <button type="button" className="vp-button" onClick={() => window.location.reload()}>Повторить</button>
        </div>
      </div>
    )
  }

  const { links } = dashboard
  const unavailableValue = "—"

  return (
    <div className="vp-overview-page">
      <header className="vp-page-header">
        <div>
          <h1 className="vp-page-title">Обзор</h1>
          <p className="vp-page-description">Основные показатели и состояние аккаунта</p>
        </div>
        <Link href="/dashboard/links" className="vp-button">
          <Link2 className="size-4" aria-hidden="true" />Создать ссылку
        </Link>
      </header>

      <section className="vp-balance-card" aria-labelledby="available-balance-heading">
        <div className="vp-balance-copy">
          <p className="vp-balance-label" id="available-balance-heading">Доступно к выплате</p>
          <p className="vp-balance-amount">{unavailableValue} MDL</p>
          <p className="vp-balance-note">Учёт начислений и выплат ещё не подключён</p>
        </div>
        <div className="vp-balance-desktop-state">
          Баланс появится здесь, когда будут доступны подтверждённые начисления.
        </div>
        <div className="vp-balance-actions">
          <Link href="/dashboard/payouts" className="vp-button vp-button-dark-glass">
            <Wallet aria-hidden="true" />Выплаты
          </Link>
          <Link href="/dashboard/links" className="vp-button vp-button-light-glass">
            <Link2 aria-hidden="true" />Создать ссылку
          </Link>
        </div>
      </section>

      <section className="vp-section-grid" aria-label="Ключевые показатели">
        <MetricCard icon={ReceiptText} label="Подтверждённые заказы" value={unavailableValue} hint="Учёт заказов пока не подключён" />
        <MetricCard icon={MousePointer2} label="Конверсия" value={unavailableValue} hint="Нет данных о переходах и заказах" />
        <MetricCard icon={Link2} label="Активные ссылки" value={numberFormat.format(links.active)} hint={`${numberFormat.format(links.total)} всего создано`} />
      </section>

      <section className="vp-mobile-metrics vp-surface-card" aria-label="Ключевые показатели">
        <MobileMetric icon={MousePointer2} label="Переходы" value={unavailableValue} hint="Учёт переходов не подключён" />
        <MobileMetric icon={ReceiptText} label="Заказы" value={unavailableValue} hint="Учёт заказов не подключён" />
        <MobileMetric icon={Link2} label="Активные ссылки" value={numberFormat.format(links.active)} hint="Число активных ссылок" />
      </section>

      <section className="vp-surface-card vp-chart-card" aria-labelledby="rewards-chart-heading">
        <div className="vp-card-heading-row">
          <h2 className="vp-card-heading" id="rewards-chart-heading">Динамика вознаграждений</h2>
        </div>
        <div className="vp-chart-empty">График появится после подключения реальных данных о начислениях.</div>
      </section>

      <div className="vp-overview-lower-grid">
        <section className="vp-surface-card" aria-labelledby="recent-orders-heading">
          <h2 className="vp-card-heading" id="recent-orders-heading">Последние заказы</h2>
          <div className="vp-empty-state">
            <strong>Данных пока нет</strong>
            <span>Заказы и их связь с referral-ссылками ещё не подключены.</span>
          </div>
        </section>

        <section className="vp-surface-card" aria-labelledby="recent-links-heading">
          <div className="vp-card-heading-row">
            <h2 className="vp-card-heading" id="recent-links-heading">Последние ссылки</h2>
            <Link href="/dashboard/links" className="vp-card-link">Все ссылки<ArrowRight className="size-4" aria-hidden="true" /></Link>
          </div>
          {linksState === "loading" ? <div className="vp-empty-state" role="status">Загружаем ссылки…</div> : null}
          {linksState === "error" ? <div className="vp-empty-state"><strong>Список временно недоступен</strong><span>Попробуйте открыть раздел «Мои ссылки».</span></div> : null}
          {linksState === "ready" ? <LinkRows links={referralLinks} /> : null}
        </section>
      </div>

      <section className="vp-mobile-activity vp-surface-card" aria-labelledby="recent-activity-heading">
        <div className="vp-card-heading-row">
          <h2 className="vp-card-heading" id="recent-activity-heading">Последние операции</h2>
          <Link href="/dashboard/orders" className="vp-card-link">Все<ArrowRight className="size-4" aria-hidden="true" /></Link>
        </div>
        <div className="vp-empty-state">
          <strong>Операций пока нет</strong>
          <span>Здесь появятся подтверждённые заказы и начисления.</span>
        </div>
      </section>

      <section className="vp-mobile-links vp-surface-card" aria-labelledby="mobile-recent-links-heading">
        <div className="vp-card-heading-row">
          <h2 className="vp-card-heading" id="mobile-recent-links-heading">Мои ссылки</h2>
          <Link href="/dashboard/links" className="vp-card-link">Все<ArrowRight className="size-4" aria-hidden="true" /></Link>
        </div>
        {linksState === "loading" ? <div className="vp-empty-state" role="status">Загружаем ссылки…</div> : null}
        {linksState === "error" ? <div className="vp-empty-state"><strong>Список временно недоступен</strong><span>Откройте раздел «Мои ссылки».</span></div> : null}
        {linksState === "ready" ? <LinkRows links={referralLinks} /> : null}
      </section>

      <div className="vp-mobile-payout-link">
        <Link href="/dashboard/payouts"><BadgeDollarSign className="size-4" aria-hidden="true" />Информация о выплатах<ArrowRight className="size-4" aria-hidden="true" /></Link>
      </div>
    </div>
  )
}
