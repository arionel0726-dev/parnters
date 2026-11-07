"use client"

import { useRouter } from "next/navigation"
import { useState, type MouseEvent, type ReactNode } from "react"
import { cn } from "@/lib/utils"

const AUTH_ROUTES = new Set(["/login", "/forgot-password", "/reset-password"])
const EXIT_DURATION_MS = 220

export function AuthPageTransition({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter()
  const [exiting, setExiting] = useState(false)

  function handleNavigation(event: MouseEvent<HTMLDivElement>) {
    if (exiting || event.defaultPrevented) return

    const target = event.target
    if (!(target instanceof Element)) return

    const anchor = target.closest("a")
    if (!anchor || anchor.target && anchor.target !== "_self") return

    const destination = new URL(anchor.href, window.location.href)
    if (destination.origin !== window.location.origin || !AUTH_ROUTES.has(destination.pathname)) return
    if (destination.pathname === window.location.pathname && destination.search === window.location.search) return

    event.preventDefault()
    setExiting(true)
    window.setTimeout(() => {
      router.push(`${destination.pathname}${destination.search}${destination.hash}`)
    }, EXIT_DURATION_MS)
  }

  return (
    <div
      className={cn("auth-page-transition", exiting && "auth-page-transition--exiting", className)}
      onClickCapture={handleNavigation}
    >
      {children}
    </div>
  )
}
