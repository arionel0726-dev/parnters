"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useState, useSyncExternalStore } from "react"
import {
  ClipboardCheck,
  FileText,
  Link2,
  LayoutDashboard,
  ListChecks,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react"
import type { ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useDashboardLocale } from "@/components/dashboard/dashboard-locale-provider"
import {
  avatarColorOptions,
  getAvatarColorSnapshot,
  getServerAvatarColorSnapshot,
  setAvatarColor,
  subscribeToAvatarColor,
  type AvatarColorId,
} from "@/components/creator-dashboard/avatar-preferences"
import LocaleSwitcher from "@/components/landing/locale-switcher"
import { NotificationBell } from "@/components/notifications/notification-bell"

const primaryNavigation = [
  { label: "Обзор", href: "/app", icon: LayoutDashboard },
  { label: "Партнёры", href: "/app/partners", icon: UsersRound },
  { label: "Заявки", href: "/app/applications", icon: ClipboardCheck, roles: ["super_admin", "program_manager", "support"] },
  { label: "Соглашения", href: "/app/agreements", icon: FileText, disabled: false },
  { label: "Журнал аудита", href: "/app/audit-log", icon: ListChecks, disabled: false },
  { label: "Выплаты", href: "/app/payouts", icon: WalletCards, disabled: false, roles: ["super_admin", "finance"] },
  { label: "Email", href: "/app/email", icon: Mail, disabled: false, roles: ["super_admin", "program_manager", "support"] },
]

const partnerNavigation = [
  { label: "Обзор", href: "/dashboard", icon: LayoutDashboard, disabled: false },
  { label: "Мои ссылки", href: "/app/links", icon: Link2, disabled: false },
  { label: "Заказы", href: "/dashboard/orders", icon: ReceiptText, disabled: false },
  { label: "Выплаты", href: "/dashboard/payouts", icon: WalletCards, disabled: false },
]

function Navigation({ mobile, expanded, onNavigate, partnerMode, adminRole }: { mobile: boolean; expanded: boolean; onNavigate?: () => void; partnerMode: boolean; adminRole: string }) {
  const pathname = usePathname()
  const navigation = adminRole === "creator"
    ? partnerNavigation
    : [
        ...primaryNavigation.filter((item) => !item.roles || item.roles.includes(adminRole)),
        ...(partnerMode ? partnerNavigation : []),
      ]

  return (
    <nav className={cn("space-y-2", !mobile && (expanded ? "flex flex-col" : "flex flex-col items-center"))} aria-label="Основная навигация">
      {navigation.map(({ label, href, icon: Icon, disabled }) => {
        const active = !disabled && (href === "/app" ? pathname === href : pathname.startsWith(href))

        if (disabled) {
          return (
            <div
              key={label}
              className={cn(
                "group flex items-center rounded-none text-sm text-smoke/55",
                mobile ? "h-11 gap-3 px-3" : expanded ? "h-11 w-full gap-3 px-3" : "size-12 justify-center",
              )}
              aria-disabled="true"
              title={`${label} — скоро`}
            >
              <Icon className="size-[19px]" strokeWidth={1.7} aria-hidden="true" />
              {mobile || expanded ? <span>{label}</span> : <span className="sr-only">{label}</span>}
              {mobile ? <span className="ml-auto text-[10px] uppercase tracking-[0.08em]">Скоро</span> : null}
            </div>
          )
        }

        return (
          <Link
            key={label}
            href={href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center rounded-none text-sm transition-colors",
              mobile ? "h-11 gap-3 px-3" : expanded ? "h-11 w-full gap-3 px-3" : "size-12 justify-center",
              active ? "bg-[#f0f0ee] font-medium text-ink" : "text-smoke hover:bg-[#f6f6f4] hover:text-ink",
            )}
            aria-current={active ? "page" : undefined}
            title={!mobile && !expanded ? label : undefined}
          >
            <Icon className="size-[19px]" strokeWidth={1.7} aria-hidden="true" />
            {mobile || expanded ? <span>{label}</span> : <span className="sr-only">{label}</span>}
          </Link>
        )
      })}
    </nav>
  )
}

function Sidebar({ mobile = false, expanded = false, onClose, onToggle, partnerMode, adminRole }: { mobile?: boolean; expanded?: boolean; onClose?: () => void; onToggle?: () => void; partnerMode: boolean; adminRole: string }) {
  const { locale, mode } = useDashboardLocale()

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-white",
        mobile ? "w-full" : expanded ? "w-[240px]" : "w-[84px]",
        !mobile && "transition-[width] duration-200 ease-out",
      )}
    >
      <div className={cn("flex h-16 items-center border-b border-border", mobile ? "justify-between px-5" : expanded ? "justify-start px-4" : "justify-center")}>
        <Link
          href="/"
          className={cn("flex items-center text-ink", mobile ? "" : expanded ? "gap-3" : "size-12 justify-center")}
          onClick={onClose}
          aria-label="Vizaje Partners"
          title="Vizaje Partners"
        >
          <Image src="/brand/mini-logo.svg" alt="" aria-hidden="true" width={36} height={27} className="h-6 w-8 object-contain lg:h-[27px] lg:w-9" />
        </Link>
        {mobile ? (
          <button type="button" className="rounded-none p-2 text-smoke hover:bg-[#f6f6f4]" onClick={onClose} aria-label="Закрыть навигацию">
            <X className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className={cn("flex flex-1", mobile ? "flex-col px-4 py-5" : expanded ? "flex-col px-3 py-6" : "flex-col items-center py-6")}>
        <Navigation mobile={mobile} expanded={expanded} onNavigate={onClose} partnerMode={partnerMode} adminRole={adminRole} />

        <div className={cn("mt-auto", mobile ? "space-y-4" : expanded ? "flex flex-col gap-3" : "flex flex-col items-center gap-3")}>
          {!mobile && onToggle ? (
            <button
              type="button"
              className={cn(
                "flex items-center rounded-none text-sm text-smoke transition-colors hover:bg-[#f6f6f4] hover:text-ink",
                expanded ? "h-11 w-full gap-3 px-3" : "size-12 justify-center",
              )}
              onClick={onToggle}
              title={expanded ? "Скрыть боковую панель" : "Развернуть боковую панель"}
              aria-label={expanded ? "Скрыть боковую панель" : "Развернуть боковую панель"}
            >
              {expanded ? <PanelLeftClose className="size-[19px]" strokeWidth={1.7} aria-hidden="true" /> : <PanelLeftOpen className="size-[19px]" strokeWidth={1.7} aria-hidden="true" />}
              {expanded ? <span>Скрыть</span> : <span className="sr-only">Развернуть</span>}
            </button>
          ) : null}
          {mobile && mode === "creator" ? <LocaleSwitcher locale={locale} className="flex h-11 items-center gap-3 px-3 text-sm font-medium" /> : null}

          <div className={cn("flex items-center", mobile ? "gap-3 px-3" : "justify-center")}>
            <div className="flex size-9 items-center justify-center rounded-sm border border-border bg-[#f7f7f5] text-xs font-medium text-ink">VP</div>
            {mobile ? (
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">Команда Vizaje</div>
                <div className="truncate text-xs text-smoke">Рабочее пространство</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  )
}

type PartnerProfile = {
  displayName: string | null
  email: string
  creatorId: string | null
  status: "active" | "suspended" | "banned"
}

function emailInitial(email: string) {
  return email.trim().slice(0, 1).toLocaleUpperCase("ru-RU") || "V"
}

export function AppShell({ children, partnerMode = false, partner = null, adminRole = "super_admin" }: { children: ReactNode; partnerMode?: boolean; partner?: PartnerProfile | null; adminRole?: string }) {
  const router = useRouter()
  const { locale, mode } = useDashboardLocale()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [logoutPending, setLogoutPending] = useState(false)
  const avatarColorId = useSyncExternalStore(subscribeToAvatarColor, getAvatarColorSnapshot, getServerAvatarColorSnapshot)
  const avatarColor = avatarColorOptions.find((option) => option.id === avatarColorId) ?? avatarColorOptions[0]
  const partnerName = partner?.displayName || partner?.email || "Команда Vizaje"
  const partnerInitial = partner ? emailInitial(partner.email) : "V"
  const partnerAvatarStyle = { backgroundColor: avatarColor.color, color: avatarColor.foreground }

  async function handleLogout() {
    setLogoutPending(true)
    try {
      await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" })
    } finally {
      router.replace("/login")
      router.refresh()
    }
  }

  return (
    <div className="app-surface flex min-h-screen bg-white text-ink">
      <div className="hidden lg:block">
        <Sidebar expanded={sidebarExpanded} onToggle={() => setSidebarExpanded((current) => !current)} partnerMode={partnerMode} adminRole={adminRole} />
      </div>

      <div
        className="app-mobile-navigation fixed inset-0 z-50 flex lg:hidden"
        data-open={mobileOpen ? "true" : "false"}
        role="dialog"
        aria-modal="true"
        aria-hidden={!mobileOpen}
        aria-label="Основная навигация"
      >
        <button type="button" className="app-mobile-navigation-overlay absolute inset-0" onClick={() => setMobileOpen(false)} aria-label="Закрыть затемнение навигации" />
        <div className="app-mobile-navigation-panel relative z-10 h-full w-full">
          <Sidebar mobile onClose={() => setMobileOpen(false)} partnerMode={partnerMode} adminRole={adminRole} />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-4 sm:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              className="rounded-none p-2 text-smoke hover:bg-[#f6f6f4] hover:text-ink lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Открыть навигацию"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell href={partnerMode ? "/app/notifications" : "/app/notifications"} />
            <div className="hidden h-7 w-px bg-border sm:block" aria-hidden="true" />
            <button
              type="button"
              className="flex size-11 shrink-0 aspect-square items-center justify-center rounded-full text-xs font-medium"
              style={partnerMode && partner ? partnerAvatarStyle : undefined}
              data-avatar-color={partnerMode && partner ? avatarColorId : undefined}
              onClick={() => setProfileOpen(true)}
              aria-label={partnerMode && partner ? `Профиль ${partnerName}` : "Профиль команды Vizaje"}
            >
              {partnerMode && partner ? partnerInitial : "V"}
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="rounded-none border-border bg-white p-6 text-ink sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-sans text-lg font-medium tracking-[-0.01em]">{partnerMode && partner ? partnerName : "Команда Vizaje"}</DialogTitle>
            <DialogDescription className="text-sm text-smoke">{partnerMode && partner ? "Профиль креатора." : "Профиль рабочего пространства."}</DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex items-center gap-3 border-t border-border pt-4">
            <div
              className="flex size-10 items-center justify-center rounded-full text-xs font-medium"
              style={partnerMode && partner ? partnerAvatarStyle : { backgroundColor: "#252a24", color: "#ffffff" }}
            >
              {partnerMode && partner ? partnerInitial : "V"}
            </div>
            <div>
              <p className="text-sm font-medium text-ink">{partnerMode && partner ? partnerName : "Команда Vizaje"}</p>
              <p className="text-xs text-smoke">{partnerMode && partner ? partner.email : "Участник рабочего пространства"}</p>
              {partnerMode && partner?.creatorId ? <p className="mt-1 text-[11px] text-smoke">Creator ID: {partner.creatorId}</p> : null}
            </div>
          </div>
          {partnerMode && partner ? (
            <div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
              <span className="text-sm text-smoke">Цвет аватара</span>
              <div className="flex flex-wrap justify-end gap-2" role="group" aria-label="Цвет аватара">
                {avatarColorOptions.map((option) => {
                  const selected = avatarColorId === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={cn("size-6 rounded-full border border-border", selected && "ring-2 ring-ink ring-offset-2")}
                      style={{ backgroundColor: option.color }}
                      onClick={() => setAvatarColor(option.id as AvatarColorId)}
                      aria-label={`Цвет аватара: ${option.id}`}
                      aria-pressed={selected}
                    />
                  )
                })}
              </div>
            </div>
          ) : null}
          {mode === "creator" ? (
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm text-smoke">Язык</span>
              <LocaleSwitcher locale={locale} className="flex items-center gap-3 text-xs font-medium uppercase" />
            </div>
          ) : null}
          <button
            type="button"
            className="mt-5 h-10 w-full rounded-none border border-[#b42318]/40 px-3 text-sm font-medium text-[#8d1d15] hover:bg-[#b42318]/5 disabled:opacity-60"
            onClick={handleLogout}
            disabled={logoutPending}
          >
            {logoutPending ? "Выходим..." : "Выйти"}
          </button>
        </DialogContent>
      </Dialog>

    </div>
  )
}
