"use client"

import Link from "next/link"
import { Check, ExternalLink, LoaderCircle } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useDashboardLocale } from "@/components/dashboard/dashboard-locale-provider"
import { formatNotificationDate, safeNotificationHref, type NotificationItem } from "@/components/notifications/notification-utils"

type NotificationsPageProps = {
  fallbackHref: string
}

type NotificationsResponse = {
  notifications: NotificationItem[]
  total: number
  unreadCount: number
  page: number
  pageSize: number
}

export function NotificationsPage({ fallbackHref }: NotificationsPageProps) {
  const { locale, copy } = useDashboardLocale()
  const [data, setData] = useState<NotificationsResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async (requestedPage = page) => {
    setLoading(true)
    setError(false)
    try {
      const response = await fetch(`/api/notifications?page=${requestedPage}&pageSize=20`, { cache: "no-store" })
      if (!response.ok) throw new Error("notifications request failed")
      setData(await response.json() as NotificationsResponse)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(page) }, 0)
    return () => window.clearTimeout(timer)
  }, [load, page])

  async function markRead(item: NotificationItem) {
    if (item.readAt) return
    const response = await fetch(`/api/notifications/${item.id}/read`, { method: "POST" })
    if (!response.ok) return
    setData((current) => current ? {
      ...current,
      unreadCount: Math.max(0, current.unreadCount - 1),
      notifications: current.notifications.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry),
    } : current)
  }

  async function markAllRead() {
    const response = await fetch("/api/notifications/read-all", { method: "POST" })
    if (!response.ok) return
    const readAt = new Date().toISOString()
    setData((current) => current ? {
      ...current,
      unreadCount: 0,
      notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt ?? readAt })),
    } : current)
  }

  return (
    <div className="min-h-svh bg-[#fafafa] px-4 py-8 text-ink sm:px-8 lg:px-12 lg:py-12">
      <header className="mx-auto flex w-full max-w-[1120px] items-start justify-between gap-6 border-b border-border pb-7">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-smoke">Vizaje Partners</p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em] sm:text-4xl">{copy.notifications.title}</h1>
          {data && data.unreadCount > 0 ? <p className="mt-2 text-sm text-smoke">{data.unreadCount} {copy.notifications.unread.toLocaleLowerCase(locale === "ro" ? "ro-RO" : "ru-RU")}</p> : null}
        </div>
        <button type="button" onClick={() => void markAllRead()} disabled={!data?.unreadCount || loading} className="mt-1 hidden border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-white disabled:cursor-default disabled:opacity-50 sm:block">{copy.notifications.markAll}</button>
      </header>

      <main className="mx-auto mt-8 w-full max-w-[1120px]">
        {loading ? (
          <div className="space-y-3" aria-label={copy.notifications.loading}>
            {[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse border border-border bg-white" />)}
          </div>
        ) : null}
        {!loading && error ? <section className="border border-border bg-white p-8 text-sm text-smoke"><p>{copy.notifications.loadError}</p><button type="button" onClick={() => void load()} className="mt-4 border border-border px-4 py-2 text-ink">{copy.notifications.retry}</button></section> : null}
        {!loading && !error && data?.notifications.length === 0 ? <section className="border border-border bg-white p-12 text-center text-sm text-smoke">{copy.notifications.empty}</section> : null}
        {!loading && !error && data?.notifications.length ? (
          <div className="overflow-hidden border border-border bg-white">
            {data.notifications.map((item) => {
              const target = safeNotificationHref(item.metadata.href, fallbackHref)
              return (
                <article key={item.id} className={`border-b border-border p-5 last:border-b-0 sm:p-6 ${item.readAt ? "bg-white" : "bg-[#fafafa]"}`}>
                  <div className="flex items-start gap-4">
                    <span className={`mt-2 size-2 shrink-0 rounded-full ${item.readAt ? "bg-border" : "bg-[#f5c542]"}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <Link href={target} onClick={() => void markRead(item)} className="text-base font-medium hover:underline">{item.title}</Link>
                        <time className="text-xs text-smoke" dateTime={item.createdAt}>{formatNotificationDate(item.createdAt, locale)}</time>
                      </div>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-smoke">{item.message}</p>
                      <Link href={target} onClick={() => void markRead(item)} className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-smoke hover:text-ink"><span>{copy.notifications.open}</span><ExternalLink className="size-3.5" aria-hidden="true" /></Link>
                    </div>
                    {!item.readAt ? <button type="button" onClick={() => void markRead(item)} className="shrink-0 border border-border p-2 text-smoke transition-colors hover:text-ink" aria-label={copy.notifications.markRead} title={copy.notifications.markRead}><Check className="size-4" aria-hidden="true" /></button> : null}
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
        {!loading && !error && data && data.total > data.pageSize ? (
          <div className="mt-4 flex items-center justify-between gap-4">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="border border-border bg-white px-4 py-2 text-sm transition-colors hover:bg-[#f6f6f4] disabled:cursor-default disabled:opacity-50">{copy.notifications.previous}</button>
            <span className="text-xs text-smoke">{data.page} / {Math.ceil(data.total / data.pageSize)}</span>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page >= Math.ceil(data.total / data.pageSize)} className="border border-border bg-white px-4 py-2 text-sm transition-colors hover:bg-[#f6f6f4] disabled:cursor-default disabled:opacity-50">{copy.notifications.next}</button>
          </div>
        ) : null}
        {loading ? <div className="sr-only"><LoaderCircle className="animate-spin" aria-hidden="true" /></div> : null}
      </main>
    </div>
  )
}
