"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { dashboardTranslations, type DashboardMode } from "@/lib/dashboard-translations"
import type { Locale } from "@/lib/translations"

type DashboardLocaleValue = {
  locale: Locale
  mode: DashboardMode
  copy: (typeof dashboardTranslations)[Locale]["creator"]
}

const DashboardLocaleContext = createContext<DashboardLocaleValue | null>(null)

export function DashboardLocaleProvider({ locale, mode, children }: { locale: Locale; mode: DashboardMode; children: ReactNode }) {
  const value = useMemo(() => ({ locale, mode, copy: dashboardTranslations[locale].creator }), [locale, mode])
  return <DashboardLocaleContext.Provider value={value}>{children}</DashboardLocaleContext.Provider>
}

export function useDashboardLocale() {
  const value = useContext(DashboardLocaleContext)
  if (!value) throw new Error("useDashboardLocale must be used inside DashboardLocaleProvider")
  return value
}
