"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import gsap from "gsap"
import LocaleSwitcher from "./locale-switcher"
import { translations, type Locale } from "@/lib/translations"

export default function LandingMobileNav({ locale }: { locale: Locale }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const copy = translations[locale]

  useLayoutEffect(() => {
    const panel = panelRef.current

    if (!panel) {
      return
    }

    gsap.killTweensOf(panel)
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (isOpen) {
      gsap.fromTo(
        panel,
        { autoAlpha: 0, y: -10, scaleY: 0.97, transformOrigin: "top right" },
        {
          autoAlpha: 1,
          y: 0,
          scaleY: 1,
          duration: reduceMotion ? 0.01 : 0.24,
          ease: "power2.out",
          onComplete: () => gsap.set(panel, { clearProps: "all" }),
        },
      )
    } else {
      gsap.to(panel, {
        autoAlpha: 0,
        y: -8,
        scaleY: 0.98,
        duration: reduceMotion ? 0.01 : 0.18,
        ease: "power1.in",
        onComplete: () => setIsMounted(false),
      })
    }

    return () => gsap.killTweensOf(panel)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  function toggleMenu() {
    if (isOpen) {
      setIsOpen(false)
      return
    }

    setIsMounted(true)
    setIsOpen(true)
  }

  return (
    <div ref={rootRef} className="relative md:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label={isOpen ? copy.header.closeMenu : copy.header.openMenu}
        aria-expanded={isOpen}
        aria-controls={isMounted ? "landing-mobile-menu-panel" : undefined}
        onClick={toggleMenu}
        className="flex size-10 items-center justify-center rounded-full border border-border"
      >
        {isOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
      </button>

      {isMounted ? (
        <div
          ref={panelRef}
          id="landing-mobile-menu-panel"
          aria-hidden={!isOpen}
          inert={!isOpen}
          className="absolute right-0 top-full z-[60] mt-3 w-[min(20rem,calc(100vw-2rem))] origin-top-right border border-border bg-[#fdfdfd] p-4 shadow-xl"
        >
          <LocaleSwitcher locale={locale} onChange={() => setIsOpen(false)} className="flex items-center gap-4 border-b border-border pb-4 text-base font-medium" />
          <div className="mt-4 grid gap-3">
            <Link href="/login" className="inline-flex h-11 items-center justify-center rounded-full border border-border px-5 transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground">
              {copy.header.login}
            </Link>
            <Link href="/apply" className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-primary-foreground transition-colors hover:bg-primary/85">
              {copy.header.signUp}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
