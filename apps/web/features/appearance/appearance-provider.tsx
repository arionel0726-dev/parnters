"use client"

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react"
import type { ReactNode } from "react"

export const accentOptions = [
  { id: "monochrome", label: "Monochrome", color: "#111111", foreground: "#ffffff" },
  { id: "red", label: "Red", color: "#ef4444", foreground: "#ffffff" },
  { id: "orange", label: "Orange", color: "#f97316", foreground: "#ffffff" },
  { id: "yellow", label: "Yellow", color: "#f5b700", foreground: "#2b2100" },
  { id: "green", label: "Green", color: "#16a34a", foreground: "#ffffff" },
  { id: "cyan", label: "Cyan", color: "#06b6d4", foreground: "#03252c" },
  { id: "blue", label: "Blue", color: "#3b82f6", foreground: "#ffffff" },
  { id: "purple", label: "Purple", color: "#8b5cf6", foreground: "#ffffff" },
] as const

export type AccentId = (typeof accentOptions)[number]["id"]

type AccentContextValue = {
  accent: AccentId
  setAccent: (accent: AccentId) => void
  mounted: boolean
}

const AccentContext = createContext<AccentContextValue | null>(null)
const STORAGE_KEY = "vizaje-partners-accent"
const ACCENT_EVENT = "vizaje-partners-accent-change"

function subscribeToAccent(callback: () => void) {
  window.addEventListener(ACCENT_EVENT, callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener(ACCENT_EVENT, callback)
    window.removeEventListener("storage", callback)
  }
}

function getAccentSnapshot(): AccentId {
  const stored = window.localStorage.getItem(STORAGE_KEY) as AccentId | null
  return stored && accentOptions.some((option) => option.id === stored) ? stored : "monochrome"
}

function getServerAccentSnapshot(): AccentId {
  return "monochrome"
}

function subscribeToMount() {
  return () => undefined
}

function getMountedSnapshot() {
  return true
}

function getServerMountedSnapshot() {
  return false
}

export function AccentProvider({ children }: { children: ReactNode }) {
  const accent = useSyncExternalStore(subscribeToAccent, getAccentSnapshot, getServerAccentSnapshot)
  const mounted = useSyncExternalStore(subscribeToMount, getMountedSnapshot, getServerMountedSnapshot)

  function setAccent(nextAccent: AccentId) {
    window.localStorage.setItem(STORAGE_KEY, nextAccent)
    window.dispatchEvent(new Event(ACCENT_EVENT))
  }

  useEffect(() => {
    if (!mounted) return
    const root = document.documentElement
    if (accent === "monochrome") {
      root.removeAttribute("data-accent")
    } else {
      root.dataset.accent = accent
    }
    window.localStorage.setItem(STORAGE_KEY, accent)
  }, [accent, mounted])

  const value = useMemo(
    () => ({ accent, setAccent, mounted }),
    [accent, mounted],
  )

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>
}

export function useAccent() {
  const context = useContext(AccentContext)
  if (!context) throw new Error("useAccent must be used within AccentProvider")
  return context
}
