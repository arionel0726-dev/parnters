"use client"

import { createContext, useContext } from "react"
import type { ReactNode } from "react"

const SettingsDrawerContext = createContext<(() => void) | null>(null)

export function SettingsDrawerProvider({ children, onOpen }: { children: ReactNode; onOpen: () => void }) {
  return <SettingsDrawerContext.Provider value={onOpen}>{children}</SettingsDrawerContext.Provider>
}

export function useSettingsDrawer() {
  const onOpen = useContext(SettingsDrawerContext)
  if (!onOpen) throw new Error("useSettingsDrawer must be used within SettingsDrawerProvider")
  return onOpen
}
