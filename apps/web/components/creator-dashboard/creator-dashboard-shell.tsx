"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BadgeDollarSign, Bell, LayoutDashboard, Link2, LogOut, ReceiptText, Settings, Wallet } from "lucide-react"
import type { ReactNode } from "react"

const desktopNavigation = [
  { href: "/dashboard", label: "Обзор", icon: LayoutDashboard },
  { href: "/dashboard/links", label: "Мои ссылки", icon: Link2 },
  { href: "/dashboard/orders", label: "Заказы", icon: ReceiptText },
  { href: "/dashboard/earnings", label: "Вознаграждения", icon: BadgeDollarSign },
  { href: "/dashboard/payouts", label: "Выплаты", icon: Wallet },
  { href: "/dashboard/settings", label: "Настройки", icon: Settings },
] as const

const mobileNavigation = desktopNavigation.filter(({ href }) => href !== "/dashboard/payouts")

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

function initials(displayName: string) {
  return displayName.trim().split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1)).join("").toLocaleUpperCase("ru-RU") || "V"
}

export function CreatorDashboardShell({ displayName, children }: { displayName: string; children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function signOut() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" })
    } finally {
      router.replace("/login")
      router.refresh()
    }
  }

  return (
    <div className="app-surface creator-dashboard-surface min-h-svh">
      <aside className="creator-dashboard-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col px-6 py-7 lg:flex">
        <Link href="/dashboard" className="vp-brand mb-10" aria-label="Vizaje Partners — обзор">
          <span>Vizaje</span> <span className="vp-brand-light">Partners</span>
        </Link>

        <nav aria-label="Навигация кабинета" className="flex flex-col gap-1">
          {desktopNavigation.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href)
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`vp-sidebar-link${active ? " is-active" : ""}`}>
                <Icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto">
          <div className="vp-account-chip">
            <span className="vp-avatar vp-avatar-small" aria-hidden="true">{initials(displayName)}</span>
            <span className="min-w-0 flex-1 truncate">Партнёрский аккаунт</span>
            <button type="button" onClick={() => void signOut()} disabled={loggingOut} aria-label="Выйти" title="Выйти" className="vp-sidebar-signout">
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="creator-dashboard-content min-h-svh lg:pl-64">
        <header className="creator-dashboard-mobile-header sticky top-0 z-30 flex items-center justify-between px-5 lg:hidden">
          <Link href="/dashboard" className="vp-brand" aria-label="Vizaje Partners — обзор">
            <span>Vizaje</span> <span className="vp-brand-light">Partners</span>
          </Link>
          <div className="flex items-center gap-4">
            <button type="button" disabled aria-label="Уведомления пока недоступны" title="Уведомления пока недоступны" className="vp-notification-button">
              <Bell className="size-[22px]" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <Link href="/dashboard/settings" className="vp-avatar" aria-label={`Настройки профиля ${displayName}`}>
              {initials(displayName)}
            </Link>
          </div>
        </header>

        <main className="creator-dashboard-main-panel min-h-svh min-w-0 pb-[calc(102px+env(safe-area-inset-bottom))] lg:pb-0">
          {children}
        </main>
      </div>

      <nav aria-label="Навигация кабинета" className="vp-mobile-navigation fixed inset-x-4 z-40 grid grid-cols-5 lg:hidden">
        {mobileNavigation.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href)
          const mobileLabel = href === "/dashboard/earnings" ? "Награды" : label === "Обзор" ? "Обзор" : label === "Мои ссылки" ? "Ссылки" : label
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`vp-mobile-nav-link${active ? " is-active" : ""}`}>
              <span className="vp-mobile-nav-icon"><Icon className="size-[22px]" strokeWidth={1.75} aria-hidden="true" /></span>
              <span className="vp-mobile-nav-label">{mobileLabel}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
