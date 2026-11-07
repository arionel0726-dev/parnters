"use client"

import Link from "next/link"
import { ArrowRight, UsersRound } from "lucide-react"
import { useEffect, useState } from "react"
import { AdminOverviewSkeleton } from "@/components/ui/page-skeletons"

export default function DashboardPage() {
  const [overview, setOverview] = useState<{ partners: number; pendingApplications: number; referralLinks: number; clicks: number | null; confirmedOrders: number | null; failedEmails: number; pendingPayouts: string | null; pendingPayoutsByCurrency?: Array<{ currency: string; value: string }> | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetch("/api/admin/overview", { cache: "no-store" }).then(async (response) => response.ok ? await response.json() : null).then((data) => setOverview(data)).finally(() => setLoading(false))
  }, [])

  if (loading) return <AdminOverviewSkeleton />

  return (
    <section className="flex min-h-[calc(100vh-64px)] flex-col bg-white">
      <div className="flex flex-1 items-center justify-center px-5 py-20 sm:px-10">
        <div className="flex max-w-xl flex-col items-center rounded-sm border border-border bg-white px-6 py-16 text-center sm:px-16">
          <div className="mb-6 flex size-14 items-center justify-center rounded-sm border border-border bg-[#f6f6f4]">
            <UsersRound className="size-6 text-smoke" strokeWidth={1.7} aria-hidden="true" />
          </div>
          <h1 className="text-5xl leading-none tracking-[-0.025em]">Обзор</h1>
          <p className="mt-4 text-lg text-smoke">Рабочее состояние партнёрской программы</p>
          <div className="mt-8 grid w-full gap-3 text-left sm:grid-cols-2"><OverviewMetric label="Партнёры" value={overview?.partners ?? "—"} /><OverviewMetric label="Заявки на рассмотрении" value={overview?.pendingApplications ?? "—"} /><OverviewMetric label="Реферальные ссылки" value={overview?.referralLinks ?? "—"} /><OverviewMetric label="Подтверждённые заказы" value={overview?.confirmedOrders ?? "—"} /><OverviewMetric label="Переходы" value={overview?.clicks ?? "—"} /><OverviewMetric label="Выплаты в обработке" value={overview ? formatPayouts(overview.pendingPayoutsByCurrency, overview.pendingPayouts) : "—"} /><OverviewMetric label="Ошибки email" value={overview?.failedEmails ?? "—"} /></div>
          <Link
            href="/app/partners"
            className="mt-8 inline-flex h-10 items-center gap-2 rounded-none bg-charcoal px-4 text-sm font-medium tracking-[0.05em] text-white transition-opacity hover:opacity-85"
          >
            Управлять партнёрами
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="border-t border-border px-5 py-4 text-center text-xs text-smoke sm:px-10 sm:text-left">
        Обзор обновляется из текущих данных базы и финансового реестра.
      </div>
    </section>
  )
}

function formatPayouts(values: Array<{ currency: string; value: string }> | null | undefined, fallback: string | null) {
  if (!values?.length) return fallback ?? "—"
  return values.map(({ currency, value }) => `${value} ${currency}`).join(" · ")
}

function OverviewMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="border border-border bg-[#fbfbfa] px-3 py-3"><p className="text-xs text-smoke">{label}</p><p className="mt-2 text-2xl tracking-[-0.04em]">{value}</p></div>
}
