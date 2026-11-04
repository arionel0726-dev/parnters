"use client"

import { FormEvent, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function CommissionDialog({ partnerId, open, onOpenChange, onSaved }: { partnerId: string; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [rate, setRate] = useState("")
  const [startsAt, setStartsAt] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const response = await fetch(`/api/admin/partners/${partnerId}/agreements`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ commissionRate: rate, startsAt, reason }) })
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
    setSaving(false)
    if (!response.ok) { setError(body?.error?.message ?? "Unable to save agreement"); return }
    setRate(""); setStartsAt(""); setReason(""); onOpenChange(false); onSaved()
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="rounded-none border-border bg-white p-0 text-ink sm:max-w-[520px]"><DialogHeader className="border-b border-border px-6 py-5 pr-14"><DialogTitle className="font-sans text-lg font-medium">New commission agreement</DialogTitle><DialogDescription className="text-sm text-smoke">The previous active agreement remains in the history.</DialogDescription></DialogHeader><form onSubmit={submit}><div className="space-y-5 px-6 py-6"><label className="block text-sm"><span className="font-medium">Default commission rate (%)</span><input type="number" min="0" max="100" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} required className="mt-2 h-10 w-full rounded-none border border-border px-3 text-sm outline-none focus:border-ink" placeholder="10.00" /></label><label className="block text-sm"><span className="font-medium">Effective date</span><input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required className="mt-2 h-10 w-full rounded-none border border-border px-3 text-sm outline-none focus:border-ink" /></label><label className="block text-sm"><span className="font-medium">Reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} required rows={3} className="mt-2 w-full resize-y rounded-none border border-border px-3 py-2 text-sm outline-none focus:border-ink" placeholder="Why is this agreement changing?" /></label>{error ? <p className="text-xs text-[#8d1d15]" role="alert">{error}</p> : null}</div><DialogFooter className="rounded-none border-t border-border bg-white p-6"><button type="submit" disabled={saving} className="h-10 bg-charcoal px-4 text-sm font-medium text-white hover:opacity-85 disabled:opacity-50">{saving ? "Saving..." : "Save agreement"}</button></DialogFooter></form></DialogContent></Dialog>
}

