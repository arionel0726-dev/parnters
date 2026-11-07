"use client"

import { useState, useSyncExternalStore } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BadgeDollarSign, LayoutDashboard, Link2, LogOut, Menu, ReceiptText, Send, Settings, Wallet, X } from "lucide-react"
import type { ReactNode } from "react"
import LocaleSwitcher from "@/components/landing/locale-switcher"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { useDashboardLocale } from "@/components/dashboard/dashboard-locale-provider"
import type { CreatorProfile } from "@/components/creator-dashboard/types"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  avatarColorOptions,
  getAvatarColorSnapshot,
  getServerAvatarColorSnapshot,
  setAvatarColor,
  subscribeToAvatarColor,
  type AvatarColorId,
} from "./avatar-preferences"

const desktopNavigation = [
  { href: "/dashboard", key: "overview", icon: LayoutDashboard },
  { href: "/dashboard/links", key: "links", icon: Link2 },
  { href: "/dashboard/orders", key: "orders", icon: ReceiptText },
  { href: "/dashboard/earnings", key: "earnings", icon: BadgeDollarSign },
  { href: "/dashboard/payouts", key: "payouts", icon: Wallet },
  { href: "/dashboard/settings", key: "settings", icon: Settings },
] as const

const mobileNavigation = desktopNavigation.filter(({ href }) => href !== "/dashboard/payouts")

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

function emailInitial(email: string, locale: "ru" | "ro") {
  return email.trim().slice(0, 1).toLocaleUpperCase(locale === "ro" ? "ro-RO" : "ru-RU") || "V"
}

export function CreatorDashboardShell({ profile, children }: { profile: CreatorProfile; children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { locale, copy } = useDashboardLocale()
  const [loggingOut, setLoggingOut] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const avatarColorId = useSyncExternalStore(subscribeToAvatarColor, getAvatarColorSnapshot, getServerAvatarColorSnapshot)

  const avatarColor = avatarColorOptions.find((option) => option.id === avatarColorId) ?? avatarColorOptions[0]

  function selectAvatarColor(nextColor: AvatarColorId) {
    setAvatarColor(nextColor)
  }

  const avatarStyle = { backgroundColor: avatarColor.color, color: avatarColor.foreground }

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
        <Link href="/dashboard" className="vp-brand mb-10" aria-label={copy.sidebar.brand}>
          <Image src="/brand/mini-logo.svg" alt="" aria-hidden="true" width={36} height={27} className="h-[27px] w-9 object-contain" />
        </Link>

        <nav aria-label={copy.sidebar.navigation} className="flex flex-col gap-1">
          {desktopNavigation.map(({ href, key, icon: Icon }) => {
            const active = isActive(pathname, href)
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`vp-sidebar-link${active ? " is-active" : ""}`}>
                <Icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>{copy.nav[key]}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto">
          <a
            href="https://t.me/vizaje_nica_support_bot"
            target="_blank"
            rel="noreferrer"
            className="vp-sidebar-link"
            aria-label={`${copy.sidebar.telegram}: @vizaje_nica_support_bot`}
          >
            <Send className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>{copy.sidebar.telegram}</span>
          </a>
          <LocaleSwitcher locale={locale} className="mb-4 flex items-center justify-center gap-3 text-sm font-medium uppercase" />
          <div className="vp-account-chip">
            <span className="vp-avatar vp-avatar-small" style={avatarStyle} aria-hidden="true">{emailInitial(profile.email, locale)}</span>
            <span className="min-w-0 flex-1 truncate">{profile.displayName || profile.email}</span>
            <button type="button" onClick={() => void signOut()} disabled={loggingOut} aria-label={copy.sidebar.signOut} title={copy.sidebar.signOut} className="vp-sidebar-signout">
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="creator-dashboard-content min-h-svh lg:pl-64">
        <header className="creator-dashboard-mobile-header sticky top-0 z-30 flex items-center justify-between px-5 lg:hidden">
          <div className="creator-mobile-header-leading">
            <button type="button" className="creator-mobile-header-button" onClick={() => setMobileMenuOpen(true)} aria-label={copy.sidebar.openMenu}>
              <Menu className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="creator-mobile-header-actions">
            <NotificationBell href="/dashboard/notifications" className="vp-notification-button" />
            <button type="button" className="vp-avatar" style={avatarStyle} onClick={() => setProfileOpen(true)} aria-label={copy.profile.title}>
              {emailInitial(profile.email, locale)}
            </button>
          </div>
        </header>

        <main className="creator-dashboard-main-panel min-h-svh min-w-0 pb-[calc(102px+env(safe-area-inset-bottom))] lg:pb-0">
          {children}
        </main>
      </div>

      <div className="creator-mobile-menu" data-open={mobileMenuOpen ? "true" : "false"} role="dialog" aria-modal="true" aria-hidden={!mobileMenuOpen} aria-label={copy.sidebar.navigation}>
          <button type="button" className="creator-mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)} aria-label={copy.sidebar.closeMenu} />
          <aside className="creator-mobile-menu-panel">
            <div className="creator-mobile-menu-header">
              <Link href="/dashboard" className="vp-brand" onClick={() => setMobileMenuOpen(false)} aria-label={copy.sidebar.brand}>
                <Image src="/brand/mini-logo.svg" alt="" aria-hidden="true" width={36} height={27} className="h-[27px] w-9 object-contain" />
              </Link>
              <button type="button" className="creator-mobile-header-button" onClick={() => setMobileMenuOpen(false)} aria-label={copy.sidebar.closeMenu}>
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <nav aria-label={copy.sidebar.navigation} className="creator-mobile-menu-navigation">
              {desktopNavigation.map(({ href, key, icon: Icon }) => {
                const active = isActive(pathname, href)
                return (
                  <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)} aria-current={active ? "page" : undefined} className={`vp-sidebar-link${active ? " is-active" : ""}`}>
                    <Icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    <span>{copy.nav[key]}</span>
                  </Link>
                )
              })}
            </nav>
            <a
              href="https://t.me/vizaje_nica_support_bot"
              target="_blank"
              rel="noreferrer"
              className="vp-sidebar-link"
              aria-label={`${copy.sidebar.telegram}: @vizaje_nica_support_bot`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Send className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>{copy.sidebar.telegram}</span>
            </a>
            <div className="creator-mobile-menu-language">
              <span>{copy.profile.language}</span>
              <LocaleSwitcher locale={locale} onChange={() => setMobileMenuOpen(false)} className="flex items-center gap-3 text-sm font-medium uppercase" />
            </div>
            <button type="button" className="creator-mobile-menu-settings" onClick={() => { setMobileMenuOpen(false); setProfileOpen(true) }}>
              <Settings className="size-5" aria-hidden="true" />
              <span>{copy.profile.title}</span>
            </button>
          </aside>
      </div>

      <nav aria-label={copy.sidebar.navigation} className="vp-mobile-navigation fixed inset-x-0 z-40 grid grid-cols-5 lg:hidden">
        {mobileNavigation.map(({ href, key, icon: Icon }) => {
          const active = isActive(pathname, href)
          const mobileLabel = key === "earnings" ? copy.nav.mobileEarnings : key === "links" ? copy.nav.mobileLinks : copy.nav[key]
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`vp-mobile-nav-link${active ? " is-active" : ""}`}>
              <span className="vp-mobile-nav-icon"><Icon className="size-[22px]" strokeWidth={1.75} aria-hidden="true" /></span>
              <span className="vp-mobile-nav-label">{mobileLabel}</span>
            </Link>
          )
        })}
      </nav>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="creator-profile-dialog border-border bg-background p-0 text-foreground sm:max-w-[420px]">
          <DialogHeader className="border-b border-border px-6 py-5 pr-14">
            <DialogTitle className="font-sans text-lg font-medium">{copy.profile.title}</DialogTitle>
            <DialogDescription>{copy.profile.description}</DialogDescription>
          </DialogHeader>
          <div className="creator-profile-dialog-content">
            <div className="creator-profile-account">
              <span className="vp-avatar" style={avatarStyle} aria-hidden="true">{emailInitial(profile.email, locale)}</span>
              <div className="min-w-0">
                <p className="truncate text-base font-medium">{profile.displayName || profile.email}</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">{profile.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">{copy.profile.account} · {copy.profile.creatorId.replace("{id}", profile.creatorId)}</p>
              </div>
            </div>
            <div className="creator-profile-dialog-color-setting">
              <div className="min-w-0">
                <p className="text-sm font-medium">{copy.profile.avatarBackground}</p>
                <p className="mt-1 text-xs text-muted-foreground">{copy.profile.avatarColors[avatarColorId]}</p>
              </div>
              <div className="creator-profile-dialog-color-options" role="group" aria-label={copy.profile.avatarBackground}>
                {avatarColorOptions.map((option) => {
                  const selected = avatarColorId === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`creator-profile-dialog-color-button${selected ? " is-selected" : ""}`}
                      style={{ backgroundColor: option.color }}
                      onClick={() => selectAvatarColor(option.id)}
                      aria-label={copy.profile.avatarColors[option.id]}
                      aria-pressed={selected}
                    />
                  )
                })}
              </div>
            </div>
            <div className="creator-profile-dialog-row">
              <span>{copy.profile.language}</span>
              <LocaleSwitcher locale={locale} onChange={() => setProfileOpen(false)} className="flex items-center gap-3 text-sm font-medium uppercase" />
            </div>
            <Link href="/dashboard/settings" onClick={() => setProfileOpen(false)} className="creator-profile-dialog-link">
              <Settings className="size-4" aria-hidden="true" />{copy.profile.settings}
            </Link>
            <button type="button" className="creator-profile-dialog-logout" onClick={() => void signOut()} disabled={loggingOut}>
              <LogOut className="size-4" aria-hidden="true" />{loggingOut ? copy.profile.logoutPending : copy.profile.logout}
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
