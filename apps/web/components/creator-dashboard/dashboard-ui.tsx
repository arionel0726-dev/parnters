"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowRight, CircleHelp } from "lucide-react"
import { useDashboardLocale } from "@/components/dashboard/dashboard-locale-provider"

export function CreatorPageHeader({ eyebrow, title, description, action }: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="mt-2">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-base leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function CreatorMetric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <section className="min-w-0 border border-border bg-card p-5 sm:p-6">
      <p className="text-base text-muted-foreground">{label}</p>
      <p className="mt-4 break-words text-2xl font-medium tracking-[-0.035em]">{value}</p>
      {hint ? <p className="mt-2 text-sm leading-5 text-muted-foreground">{hint}</p> : null}
    </section>
  )
}

export function CreatorEmptyPage({ page }: { page: "orders" | "earnings" | "payouts" }) {
  const { copy } = useDashboardLocale()
  const content = copy.empty[page]

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
      <CreatorPageHeader title={content.title} description={content.description} />
      <section className="mt-7 border border-border bg-card px-6 py-12 text-center sm:px-10 sm:py-16">
        <span className="mx-auto flex size-11 items-center justify-center border border-border text-muted-foreground" aria-hidden="true"><CircleHelp className="size-5" strokeWidth={1.6} /></span>
        <h2 className="mt-5 text-lg font-medium">{copy.empty.noData}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{content.note}</p>
        <Link href={page === "orders" ? "/dashboard/links" : page === "earnings" ? "/dashboard/settings" : "/dashboard/earnings"} className="mt-6 inline-flex h-11 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85">
          {content.action}<ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>
    </div>
  )
}
