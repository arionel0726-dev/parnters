"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type ReadMoreTextProps = {
  title: string
  text: string
  className?: string
}

export function ReadMoreText({ title, text, className = "text-sm leading-6 text-smoke" }: ReadMoreTextProps) {
  const contentRef = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const value = text.trim() || "—"

  const measure = useCallback(() => {
    const element = contentRef.current
    if (!element) return
    setCanExpand(element.scrollHeight > element.clientHeight + 1)
  }, [])

  useEffect(() => {
    measure()
    const element = contentRef.current
    if (!element) return
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(element)
    window.addEventListener("resize", measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [measure, value])

  return (
    <div className="read-more-text">
      <p ref={contentRef} className={`read-more-text__content ${className}`}>{value}</p>
      {canExpand ? (
        <button type="button" className="read-more-text__button" onClick={() => setExpanded(true)}>
          Смотреть подробнее
          <ChevronRight aria-hidden="true" />
        </button>
      ) : null}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-h-[min(80dvh,720px)] overflow-y-auto rounded-none border-border bg-white p-0 text-ink sm:max-w-[640px]">
          <DialogHeader className="border-b border-border px-6 py-5 pr-14">
            <DialogTitle className="font-sans text-lg font-medium">{title}</DialogTitle>
            <DialogDescription className="text-sm text-smoke">Полный текст</DialogDescription>
          </DialogHeader>
          <div className="px-6 py-6">
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">{value}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
