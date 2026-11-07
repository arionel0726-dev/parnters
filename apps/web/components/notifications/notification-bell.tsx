"use client"

import Link from "next/link"
import { Bell, Check, ExternalLink, LoaderCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useDashboardLocale } from "@/components/dashboard/dashboard-locale-provider"
import { formatNotificationDate, safeNotificationHref, type NotificationItem } from "./notification-utils"

type NotificationBellProps = {
  href: string
  className?: string
}

type NotificationsResponse = {
  notifications: NotificationItem[]
  unreadCount: number
}

export function NotificationBell({ href, className }: NotificationBellProps) {
  const { locale, copy } = useDashboardLocale()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  async function loadNotifications() {
    setLoading(true)
    setError(false)
    try {
      const response = await fetch("/api/notifications?page=1&pageSize=8", { cache: "no-store" })
      if (!response.ok) throw new Error("notifications request failed")
      const data = await response.json() as NotificationsResponse
      setItems(data.notifications)
      setUnreadCount(data.unreadCount)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void fetch("/api/notifications/unread-count", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ unreadCount: number }> : Promise.reject(new Error("unread request failed")))
      .then((data) => { if (!cancelled) setUnreadCount(data.unreadCount) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => { void loadNotifications() }, 0)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  async function markRead(item: NotificationItem) {
    if (item.readAt) return
    const response = await fetch(`/api/notifications/${item.id}/read`, { method: "POST" })
    if (!response.ok) return
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry))
    setUnreadCount((current) => Math.max(0, current - 1))
  }

  async function markAllRead() {
    const response = await fetch("/api/notifications/read-all", { method: "POST" })
    if (!response.ok) return
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })))
    setUnreadCount(0)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className={className ?? "relative rounded-full border border-border p-2.5 text-ink transition-colors hover:bg-[#f6f6f4]"}
        onClick={() => setOpen((current) => !current)}
        aria-label={copy.notifications.title}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />
        {unreadCount > 0 ? <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-[#f5c542] px-1 text-[10px] font-medium leading-4 text-ink">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>

      {open ? (
        <section className="absolute right-0 top-[calc(100%+12px)] z-50 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border bg-white text-ink shadow-[0_18px_60px_rgba(0,0,0,0.14)]" role="dialog" aria-label={copy.notifications.title}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium">{copy.notifications.title}</h2>
            <button type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0} className="text-xs text-smoke transition-colors hover:text-ink disabled:cursor-default disabled:opacity-50">{copy.notifications.markAll}</button>
          </div>
          <div className="max-h-[min(420px,60vh)] overflow-y-auto">
            {loading ? <div className="flex items-center gap-2 px-4 py-8 text-sm text-smoke"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{copy.notifications.loading}</div> : null}
            {!loading && error ? <div className="px-4 py-8 text-sm text-smoke">{copy.notifications.loadError}</div> : null}
            {!loading && !error && items.length === 0 ? <p className="px-4 py-8 text-sm text-smoke">{copy.notifications.empty}</p> : null}
            {!loading && !error ? items.map((item) => {
              const target = safeNotificationHref(item.metadata.href, href)
              return (
                <div key={item.id} className={`border-b border-border px-4 py-3 last:border-b-0 ${item.readAt ? "bg-white" : "bg-[#fafafa]"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? "bg-border" : "bg-[#f5c542]"}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <Link href={target} onClick={() => { void markRead(item); setOpen(false) }} className="block text-sm font-medium hover:underline">{item.title}</Link>
                      <p className="mt-1 text-xs leading-5 text-smoke">{item.message}</p>
                      <p className="mt-1 text-[11px] text-smoke/75">{formatNotificationDate(item.createdAt, locale)}</p>
                    </div>
                    {!item.readAt ? <button type="button" onClick={() => void markRead(item)} className="shrink-0 p-1 text-smoke hover:text-ink" aria-label={copy.notifications.markRead} title={copy.notifications.markRead}><Check className="size-4" aria-hidden="true" /></button> : null}
                  </div>
                </div>
              )
            }) : null}
          </div>
          <div className="border-t border-border px-4 py-3">
            <Link href={href} onClick={() => setOpen(false)} className="flex items-center justify-between text-xs font-medium text-smoke transition-colors hover:text-ink">
              <span>{copy.notifications.all}</span><ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  )
}
