"use client"

import { useEffect, useState } from "react"
import { MetricGridSkeleton } from "@/components/ui/page-skeletons"

type MoneyBreakdown = Array<{ currency: string; amount: string }>
type Summary = { clicks: number; orders: number; grossSales: string; commission: string; requestedPayout: string; paidPayout: string; availablePayout: string; availableByCurrency: MoneyBreakdown; grossSalesByCurrency: MoneyBreakdown; commissionByCurrency: MoneyBreakdown; requestedPayoutByCurrency: MoneyBreakdown; paidPayoutByCurrency: MoneyBreakdown }

function balanceLabel(summary: Summary) {
  if (!summary.availableByCurrency.length) return summary.availablePayout
  return summary.availableByCurrency.map((balance) => `${balance.amount} ${balance.currency}`).join(" · ")
}

function moneyLabel(values: MoneyBreakdown, fallback: string) {
  if (!values.length) return fallback
  return values.map((value) => `${value.amount} ${value.currency}`).join(" · ")
}

export function AdminPartnerFinance({ partnerId }: { partnerId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    void fetch(`/api/admin/partners/${partnerId}/finance`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { summary?: Summary; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? "Не удалось загрузить статистику")
      if (current) setSummary(body.summary ?? null)
    }).catch((loadError) => { if (current) setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить статистику") }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [partnerId])
  return <section className="border-t border-border pt-5"><h2 className="text-xs uppercase tracking-[0.12em] text-smoke">Финансовая активность</h2>{error ? <p className="mt-4 text-sm text-[#8d1d15]" role="alert">{error}</p> : null}{loading ? <MetricGridSkeleton /> : null}{summary ? <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3"><Metric label="Переходы" value={summary.clicks} /><Metric label="Заказы" value={summary.orders} /><Metric label="Вознаграждение" value={moneyLabel(summary.commissionByCurrency, summary.commission)} /><Metric label="Доступно" value={balanceLabel(summary)} /><Metric label="В обработке" value={moneyLabel(summary.requestedPayoutByCurrency, summary.requestedPayout)} /><Metric label="Выплачено" value={moneyLabel(summary.paidPayoutByCurrency, summary.paidPayout)} /></dl> : null}</section>
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="border border-border p-3"><dt className="text-xs text-smoke">{label}</dt><dd className="mt-2 text-lg font-medium">{value}</dd></div>
}
