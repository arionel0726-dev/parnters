"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import {
  Bell,
  ClipboardCheck,
  FileText,
  Link2,
  LayoutDashboard,
  ListChecks,
  Menu,
  Search,
  Settings2,
  UsersRound,
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
import { AppearanceSettings } from "@/features/appearance/appearance-settings"
import { cn } from "@/lib/utils"
import { SettingsDrawerProvider } from "@/components/layout/settings-drawer-context"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

const primaryNavigation = [
  { label: "Overview", href: "/app", icon: LayoutDashboard },
  { label: "Partners", href: "/app/partners", icon: UsersRound },
  { label: "Applications", href: "/app/applications", icon: ClipboardCheck },
  { label: "Agreements", href: "/app/agreements", icon: FileText, disabled: true },
  { label: "Audit log", href: "/app/audit-log", icon: ListChecks, disabled: true },
]

const partnerNavigation = [{ label: "Мои ссылки", href: "/app/links", icon: Link2, disabled: false }]

function Navigation({ mobile, onNavigate, partnerMode }: { mobile: boolean; onNavigate?: () => void; partnerMode: boolean }) {
  const pathname = usePathname()
  const navigation = partnerMode ? partnerNavigation : primaryNavigation

  return (
    <nav className={cn("space-y-2", !mobile && "flex flex-col items-center")} aria-label="Primary navigation">
      {navigation.map(({ label, href, icon: Icon, disabled }) => {
        const active = !disabled && (href === "/app" ? pathname === href : pathname.startsWith(href))

        if (disabled) {
          return (
            <div
              key={label}
              className={cn(
                "group flex items-center rounded-none text-sm text-smoke/55",
                mobile ? "h-11 gap-3 px-3" : "size-12 justify-center",
              )}
              aria-disabled="true"
              title={`${label} is coming soon`}
            >
              <Icon className="size-[19px]" strokeWidth={1.7} aria-hidden="true" />
              {mobile ? <span>{label}</span> : <span className="sr-only">{label}</span>}
              {mobile ? <span className="ml-auto text-[10px] uppercase tracking-[0.08em]">Soon</span> : null}
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
              mobile ? "h-11 gap-3 px-3" : "size-12 justify-center",
              active ? "bg-[#f0f0ee] font-medium text-ink" : "text-smoke hover:bg-[#f6f6f4] hover:text-ink",
            )}
            aria-current={active ? "page" : undefined}
            title={!mobile ? label : undefined}
          >
            <Icon className="size-[19px]" strokeWidth={1.7} aria-hidden="true" />
            {mobile ? <span>{label}</span> : <span className="sr-only">{label}</span>}
          </Link>
        )
      })}
    </nav>
  )
}

function Sidebar({ mobile = false, onClose, onSettings, partnerMode }: { mobile?: boolean; onClose?: () => void; onSettings: () => void; partnerMode: boolean }) {
  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-white",
        mobile ? "w-full" : "w-[84px]",
      )}
    >
      <div className={cn("flex h-16 items-center border-b border-border", mobile ? "justify-between px-5" : "justify-center")}>
        <Link
          href="/"
          className={cn("flex items-center text-ink", mobile ? "" : "size-12 justify-center")}
          onClick={onClose}
          aria-label="Vizaje Partners"
          title="Vizaje Partners"
        >
          <Image src="/brand/mini-logo.svg" alt="" aria-hidden="true" width={36} height={27} className="h-6 w-8 object-contain lg:h-[27px] lg:w-9" />
        </Link>
        {mobile ? (
          <button type="button" className="rounded-none p-2 text-smoke hover:bg-[#f6f6f4]" onClick={onClose} aria-label="Close navigation">
            <X className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className={cn("flex flex-1", mobile ? "flex-col px-4 py-5" : "flex-col items-center py-6")}>
        <Navigation mobile={mobile} onNavigate={onClose} partnerMode={partnerMode} />

        <div className={cn("mt-auto", mobile ? "space-y-4" : "flex flex-col items-center gap-3")}>
          <button
            type="button"
            className={cn(
              "flex items-center rounded-none text-sm text-smoke transition-colors hover:bg-[#f6f6f4] hover:text-ink",
              mobile ? "h-11 w-full gap-3 px-3" : "size-12 justify-center",
            )}
            onClick={onSettings}
            title="Settings"
            aria-label="Open settings"
          >
            <Settings2 className="size-[19px]" strokeWidth={1.7} aria-hidden="true" />
            {mobile ? <span>Settings</span> : <span className="sr-only">Settings</span>}
          </button>

          <div className={cn("flex items-center", mobile ? "gap-3 px-3" : "justify-center")}>
            <div className="flex size-9 items-center justify-center rounded-sm border border-border bg-[#f7f7f5] text-xs font-medium text-ink">VP</div>
            {mobile ? (
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">Vizaje team</div>
                <div className="truncate text-xs text-smoke">Foundation workspace</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  )
}

export function AppShell({ children, partnerMode = false }: { children: ReactNode; partnerMode?: boolean }) {
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [logoutPending, setLogoutPending] = useState(false)

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
        <Sidebar onSettings={() => setSettingsOpen(true)} partnerMode={partnerMode} />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/10" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />
          <div className="relative z-10 h-full w-full">
            <Sidebar mobile onClose={() => setMobileOpen(false)} onSettings={() => setSettingsOpen(true)} partnerMode={partnerMode} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-4 sm:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              className="rounded-none p-2 text-smoke hover:bg-[#f6f6f4] hover:text-ink lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="relative flex h-11 w-full max-w-[520px] items-center gap-3 rounded-none border border-transparent px-3 text-left text-sm text-smoke hover:border-border hover:bg-[#f6f6f4]"
              onClick={() => setSearchOpen(true)}
              aria-label="Open search dialog"
            >
              <Search className="pointer-events-none absolute left-3 size-[18px] text-smoke" strokeWidth={1.8} aria-hidden="true" />
              <span className="pl-7">Find anything...</span>
              <kbd className="ml-auto hidden border border-border px-1.5 py-0.5 text-[10px] tracking-normal text-smoke sm:inline">⌘ K</kbd>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="relative rounded-full border border-border p-2.5 text-ink hover:bg-[#f6f6f4]"
              onClick={() => setNotificationsOpen(true)}
              aria-label="Notifications"
            >
              <Bell className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#f5c542]" aria-hidden="true" />
            </button>
            <div className="hidden h-7 w-px bg-border sm:block" aria-hidden="true" />
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full bg-[#252a24] text-xs font-medium text-white"
              onClick={() => setProfileOpen(true)}
              aria-label="Vizaje team profile"
            >
              V
            </button>
          </div>
        </header>

        <SettingsDrawerProvider onOpen={() => setSettingsOpen(true)}>
          <main className="min-w-0 flex-1">{children}</main>
        </SettingsDrawerProvider>
      </div>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="!w-full gap-0 border-l border-border bg-white p-0 text-ink sm:!w-[40vw] sm:!max-w-none" showCloseButton>
          <SheetHeader className="border-b border-border px-6 py-5 pr-16">
            <SheetTitle className="font-sans text-lg font-medium tracking-[-0.01em] text-ink">Settings</SheetTitle>
            <SheetDescription className="text-sm text-smoke">Workspace preferences</SheetDescription>
          </SheetHeader>
          <AppearanceSettings drawer />
        </SheetContent>
      </Sheet>

      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent className="rounded-none border-border bg-white p-6 text-ink sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-sans text-lg font-medium tracking-[-0.01em]">Notifications</DialogTitle>
            <DialogDescription className="text-sm text-smoke">You&apos;re all caught up.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="rounded-none border-border bg-white p-6 text-ink sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-sans text-lg font-medium tracking-[-0.01em]">Vizaje team</DialogTitle>
            <DialogDescription className="text-sm text-smoke">Foundation workspace profile.</DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex items-center gap-3 border-t border-border pt-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-[#252a24] text-xs font-medium text-white">V</div>
            <div>
              <p className="text-sm font-medium text-ink">Vizaje team</p>
              <p className="text-xs text-smoke">Workspace member</p>
            </div>
          </div>
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

      <Dialog
        open={searchOpen}
        onOpenChange={(open) => {
          setSearchOpen(open)
          if (!open) setSearchQuery("")
        }}
      >
        <DialogContent className="rounded-none border-border bg-white p-0 text-ink sm:max-w-[640px]">
          <DialogHeader className="border-b border-border px-6 py-5 pr-16">
            <DialogTitle className="font-sans text-lg font-medium tracking-[-0.01em]">Find anything</DialogTitle>
            <DialogDescription className="text-sm text-smoke">Search across your Vizaje workspace.</DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <label className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 size-[18px] text-smoke" strokeWidth={1.8} aria-hidden="true" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-11 w-full rounded-none border border-border bg-white pl-10 pr-3 text-sm text-ink outline-none placeholder:text-smoke focus:border-ink"
                placeholder="Search partners, agreements, activity..."
                aria-label="Search workspace"
              />
            </label>
            <div className="mt-6 border border-border px-4 py-8 text-center">
              <p className="text-sm font-medium text-ink">{searchQuery ? `No results for “${searchQuery}”` : "Start typing to search"}</p>
              <p className="mt-1 text-xs text-smoke">Partners, agreements, and activity will appear here.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
