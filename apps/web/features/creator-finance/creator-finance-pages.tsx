"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Check, LoaderCircle, WalletCards } from "lucide-react"
import { CreatorMetric, CreatorPageHeader } from "@/components/creator-dashboard/dashboard-ui"
import { useDashboardLocale } from "@/components/dashboard/dashboard-locale-provider"
import { CreatorFinanceSkeleton } from "@/components/ui/page-skeletons"

type FinanceCopy = ReturnType<typeof useDashboardLocale>["copy"]["finance"]
type Order = {
  id: string
  orderId: string
  amount: string
  currency: string
  commissionRate: string
  commissionAmount: string
  status: "confirmed" | "cancelled"
  occurredAt: string
  referralCode: string
  linkLabel: string
}
type Payout = {
  id: string
  amount: string
  currency: string
  status: "requested" | "approved" | "paid" | "rejected" | "cancelled"
  requestedAt: string
  processedAt: string | null
  rejectionReason: string | null
}
type MoneyBreakdown = Array<{ currency: string; amount: string }>
type FinanceData = {
  summary: {
    clicks: number
    orders: number
    grossSales: string
    commission: string
    requestedPayout: string
    paidPayout: string
    availablePayout: string
    availableByCurrency: MoneyBreakdown
    grossSalesByCurrency: MoneyBreakdown
    commissionByCurrency: MoneyBreakdown
    requestedPayoutByCurrency: MoneyBreakdown
    paidPayoutByCurrency: MoneyBreakdown
  }
  orders: Order[]
  payouts: Payout[]
}

function dateLabel(value: string, locale: "ru" | "ro") {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "ru-RU", { dateStyle: "medium" }).format(new Date(value))
}

function amountLabel(value: string | number, currency = "") {
  const number = Number(value)
  const formatted = Number.isFinite(number) ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number) : "—"
  return currency ? `${formatted} ${currency}` : formatted
}

function balanceLabel(balances: Array<{ currency: string; amount: string }>, fallback: string) {
  if (!balances.length) return amountLabel(fallback)
  return balances.map((balance) => amountLabel(balance.amount, balance.currency)).join(" · ")
}

function breakdownLabel(values: MoneyBreakdown, fallback: string) {
  return balanceLabel(values, fallback)
}

function StatusLabel({ status, copy }: { status: Payout["status"] | Order["status"]; copy: FinanceCopy }) {
  const labels = {
    confirmed: copy.confirmed,
    cancelled: copy.cancelled,
    requested: copy.payoutRequested,
    approved: copy.payoutApproved,
    paid: copy.payoutPaid,
    rejected: copy.payoutRejected,
  } as const
  return <span className="inline-flex border border-border px-2 py-1 text-xs text-muted-foreground">{labels[status]}</span>
}

function useFinanceData(path: string) {
  const [data, setData] = useState<FinanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      setDisabled(false)
      void fetch(path, { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json() as FinanceData & { error?: { code?: string; message?: string } }
          if (!response.ok) {
            if (body.error?.code === "FEATURE_DISABLED" && current) setDisabled(true)
            throw new Error(body.error?.message ?? "Finance request failed")
          }
          return body
        })
        .then((body) => { if (current) setData(body) })
        .catch((loadError) => { if (current) setError(loadError instanceof Error ? loadError.message : "Finance request failed") })
        .finally(() => { if (current) setLoading(false) })
    }, 0)
    return () => { current = false; window.clearTimeout(timer) }
  }, [path, reloadToken])

  return { data, loading, error, disabled, reload: () => setReloadToken((value) => value + 1) }
}

function FinanceUnavailable({ copy }: { copy: string }) {
  return <section className="mt-7 border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground" role="status">{copy}</section>
}

function FinanceSummary({ data, copy }: { data: FinanceData; copy: FinanceCopy }) {
  return (
    <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <CreatorMetric label={copy.clicks} value={data.summary.clicks} />
      <CreatorMetric label={copy.orders} value={data.summary.orders} />
      <CreatorMetric label={copy.commission} value={breakdownLabel(data.summary.commissionByCurrency, data.summary.commission)} />
      <CreatorMetric label={copy.available} value={balanceLabel(data.summary.availableByCurrency, data.summary.availablePayout)} />
    </section>
  )
}

function OrdersTable({ orders, copy, locale }: { orders: Order[]; copy: FinanceCopy; locale: "ru" | "ro" }) {
  if (!orders.length) return <div className="mt-7 border border-border bg-card px-6 py-14 text-center text-sm text-muted-foreground">{copy.empty}</div>
  return (
    <div className="mt-7 overflow-x-auto border border-border bg-card">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-muted text-xs uppercase tracking-[0.08em] text-muted-foreground"><tr><th className="px-4 py-3 font-medium">{copy.order}</th><th className="px-4 py-3 font-medium">{copy.link}</th><th className="px-4 py-3 font-medium">{copy.amount}</th><th className="px-4 py-3 font-medium">{copy.status}</th><th className="px-4 py-3 font-medium">{copy.date}</th></tr></thead>
        <tbody>{orders.map((order) => <tr key={order.id} className="border-t border-border"><td className="px-4 py-4 font-mono text-xs">{order.orderId}</td><td className="px-4 py-4"><div>{order.linkLabel}</div><div className="mt-1 text-xs text-muted-foreground">/r/{order.referralCode}</div></td><td className="px-4 py-4"><div>{amountLabel(order.amount, order.currency)}</div><div className="mt-1 text-xs text-muted-foreground">{amountLabel(order.commissionAmount, order.currency)} · {order.commissionRate}%</div></td><td className="px-4 py-4"><StatusLabel status={order.status} copy={copy} /></td><td className="px-4 py-4 text-muted-foreground">{dateLabel(order.occurredAt, locale)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

export function CreatorOrdersPage() {
  const { copy, locale } = useDashboardLocale()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [appliedRange, setAppliedRange] = useState({ from: "", to: "" })
  const params = new URLSearchParams()
  if (appliedRange.from) params.set("from", appliedRange.from)
  if (appliedRange.to) params.set("to", appliedRange.to)
  const path = `/api/partner/orders${params.toString() ? `?${params}` : ""}`
  const shown = useFinanceData(path)

  function applyFilters(event: FormEvent) { event.preventDefault(); setAppliedRange({ from, to }) }

  return <div className="mx-auto w-full max-w-[1120px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10"><CreatorPageHeader title={copy.finance.ordersTitle} description={copy.finance.ordersDescription} /><form onSubmit={applyFilters} className="mt-7 flex flex-col gap-3 border border-border bg-card p-4 sm:flex-row sm:items-end"><label className="text-sm"><span className="font-medium">{copy.finance.from}</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-2 block h-10 border border-input bg-background px-3 text-sm" /></label><label className="text-sm"><span className="font-medium">{copy.finance.to}</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-2 block h-10 border border-input bg-background px-3 text-sm" /></label><button type="submit" className="h-10 bg-primary px-4 text-sm font-medium text-primary-foreground">{copy.finance.apply}</button></form>{shown.loading ? <CreatorFinanceSkeleton mode="orders" /> : null}{shown.disabled ? <FinanceUnavailable copy={copy.finance.disabled} /> : null}{shown.error && !shown.disabled ? <div className="mt-7 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert"><p>{copy.finance.loadError}</p><button type="button" className="mt-3 underline" onClick={shown.reload}>{copy.dashboard.retry}</button></div> : null}{shown.data ? <><FinanceSummary data={shown.data} copy={copy.finance} /><OrdersTable orders={shown.data.orders} copy={copy.finance} locale={locale} /></> : null}</div>
}

export function CreatorEarningsPage() {
  const { copy, locale } = useDashboardLocale()
  const { data, loading, error, disabled, reload } = useFinanceData("/api/partner/analytics")
  return <div className="mx-auto w-full max-w-[1120px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10"><CreatorPageHeader title={copy.finance.earningsTitle} description={copy.finance.earningsDescription} />{loading ? <CreatorFinanceSkeleton mode="earnings" /> : null}{disabled ? <FinanceUnavailable copy={copy.finance.disabled} /> : null}{error && !disabled ? <div className="mt-7 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert"><p>{copy.finance.loadError}</p><button type="button" className="mt-3 underline" onClick={reload}>{copy.dashboard.retry}</button></div> : null}{data ? <><FinanceSummary data={data} copy={copy.finance} /><section className="mt-7 grid gap-3 sm:grid-cols-2"><CreatorMetric label={copy.finance.grossSales} value={breakdownLabel(data.summary.grossSalesByCurrency, data.summary.grossSales)} /><CreatorMetric label={copy.finance.paid} value={breakdownLabel(data.summary.paidPayoutByCurrency, data.summary.paidPayout)} /></section><OrdersTable orders={data.orders} copy={copy.finance} locale={locale} /></> : null}</div>
}

export function CreatorPayoutsPage() {
  const { copy, locale } = useDashboardLocale()
  const { data, loading, error, disabled, reload } = useFinanceData("/api/partner/payouts")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("MDL")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const payoutRequestKey = useRef<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true); setFormError(null); setSaved(false)
    try {
      payoutRequestKey.current ??= crypto.randomUUID()
      const response = await fetch("/api/partner/payouts", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": payoutRequestKey.current }, body: JSON.stringify({ amount: Number(amount), currency }) })
      const body = await response.json() as { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? copy.finance.loadError)
      setAmount(""); setSaved(true); payoutRequestKey.current = null; reload()
    } catch (submitError) { setFormError(submitError instanceof Error ? submitError.message : copy.finance.loadError) } finally { setSaving(false) }
  }

  const status = (value: Payout["status"]) => <StatusLabel status={value} copy={copy.finance} />
  return <div className="mx-auto w-full max-w-[1120px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10"><CreatorPageHeader title={copy.finance.payoutsTitle} description={copy.finance.payoutsDescription} />{loading ? <CreatorFinanceSkeleton mode="payouts" /> : null}{disabled ? <FinanceUnavailable copy={copy.finance.disabled} /> : null}{error && !disabled ? <div className="mt-7 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert"><p>{copy.finance.loadError}</p><button type="button" className="mt-3 underline" onClick={reload}>{copy.dashboard.retry}</button></div> : null}{data ? <><FinanceSummary data={data} copy={copy.finance} /><form onSubmit={submit} className="creator-payout-form mt-7 grid gap-4 border border-border bg-card p-5 sm:grid-cols-[1fr_160px_auto] sm:items-end"><label className="text-sm"><span className="font-medium">{copy.finance.payoutAmount}</span><input required min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="creator-payout-amount mt-2 h-10 w-full border border-input bg-background px-3 text-sm" /></label><label className="text-sm"><span className="font-medium">{copy.finance.currency}</span><select value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-2 h-10 w-full border border-input bg-background px-3 text-sm"><option>MDL</option></select></label><button type="submit" disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? <LoaderCircle className="size-4 animate-spin" /> : <WalletCards className="size-4" />}{saving ? copy.finance.submitting : copy.finance.requestPayout}</button>{saved ? <p className="inline-flex items-center gap-2 text-sm text-[#15803d] sm:col-span-3"><Check className="size-4" />{copy.finance.payoutCreated}</p> : null}{formError ? <p className="text-sm text-destructive sm:col-span-3" role="alert">{formError}</p> : null}</form><section className="mt-7 border border-border bg-card"><div className="border-b border-border px-4 py-3 text-xs uppercase tracking-[0.08em] text-muted-foreground">{copy.finance.payoutsTitle}</div>{!data.payouts.length ? <p className="px-5 py-12 text-center text-sm text-muted-foreground">{copy.finance.payoutEmpty}</p> : <div className="divide-y divide-border">{data.payouts.map((payout) => <div key={payout.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm"><div><p className="font-medium">{amountLabel(payout.amount, payout.currency)}</p><p className="mt-1 text-xs text-muted-foreground">{dateLabel(payout.requestedAt, locale)}{payout.rejectionReason ? ` · ${payout.rejectionReason}` : ""}</p></div>{status(payout.status)}</div>)}</div>}</section></> : null}</div>
}
