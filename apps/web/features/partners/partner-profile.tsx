"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CommissionDialog } from "./commission-dialog"
import { AdminReferralLinks } from "@/features/referral-links/admin-referral-links"

type Partner = { id: string; creatorId: string | null; displayName: string; email: string | null; phone: string | null; dateOfBirth: string | null; instagram: string | null; tiktok: string | null; otherSocial: string | null; introduction: string | null; type: "creator" | "referral"; tier: "starter" | "growth" | "premium"; status: "active" | "suspended" | "banned"; createdAt: string; updatedAt: string }
type Agreement = { id: string; commissionRate: string; startsAt: string; endsAt: string | null; status: string; reason: string; createdAt: string }
type Invitation = { id: string; status: "pending" | "accepted" | "expired" | "revoked"; expiresAt: string; createdAt: string; acceptedAt: string | null }
type Application = { id: string; fullName: string; status: string; createdAt: string; introduction: string }
type Activity = { id: string; action: string; metadata: Record<string, unknown>; createdAt: string; actor: { id: string; name: string | null; email: string } | null }
type Detail = { partner: Partner; agreements: Agreement[]; applications: Application[]; invitations: Invitation[]; reviews: Array<{ id: string; applicationId: string; action: string; reason: string | null; createdAt: string; reviewer: { id: string; name: string | null; email: string } | null }>; activity: Activity[] }

const statusLabels = { active: "Active", suspended: "Suspended", banned: "Banned" }

export function PartnerProfile({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [commissionOpen, setCommissionOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/admin/partners/${id}`, { cache: "no-store" })
    const body = await response.json() as Detail & { error?: { message?: string } }
    if (!response.ok) setError(body.error?.message ?? "Unable to load partner")
    else setDetail(body)
    setLoading(false)
  }, [id])
  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  if (loading) return <section className="min-h-[calc(100vh-64px)] bg-white px-5 py-10 text-smoke sm:px-8 lg:px-10">Loading partner...</section>
  if (error || !detail) return <section className="min-h-[calc(100vh-64px)] bg-white px-5 py-10 sm:px-8 lg:px-10"><p className="border border-[#b42318]/30 bg-[#b42318]/5 px-3 py-2 text-sm text-[#8d1d15]" role="alert">{error ?? "Partner not found"}</p></section>
  const { partner, agreements, applications, invitations, reviews, activity } = detail
  const currentAgreement = agreements.find((agreement) => agreement.status === "active")

  return <section className="min-h-[calc(100vh-64px)] bg-white px-5 py-8 sm:px-8 lg:px-10"><div className="mx-auto max-w-[1200px]"><div className="flex flex-col gap-4 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between"><div><Link href="/app/partners" className="inline-flex items-center gap-2 text-sm text-smoke hover:text-ink"><ArrowLeft className="size-4" />Back to partners</Link><h1 className="mt-5 text-4xl tracking-[-0.04em]">{partner.displayName}</h1><p className="mt-2 font-mono text-xs text-smoke">{partner.creatorId ?? partner.id}</p></div><div className="flex items-center gap-3"><span className="text-sm">{statusLabels[partner.status]}</span><button type="button" onClick={() => setStatusOpen(true)} className="h-10 border border-border px-4 text-sm font-medium hover:bg-[#f6f6f4]">Change status</button></div></div>
    <div className="grid gap-6 py-8 lg:grid-cols-[1.25fr_0.75fr]"><div className="space-y-6"><InfoSection title="Basic information"><dl className="grid gap-5 sm:grid-cols-2"><InfoItem label="Name" value={partner.displayName} /><InfoItem label="Email" value={partner.email} /><InfoItem label="Phone" value={partner.phone} /><InfoItem label="Date of birth" value={partner.dateOfBirth} /><InfoItem label="Partner type" value={partner.type} /><InfoItem label="Tier" value={partner.tier} /></dl></InfoSection><InfoSection title="Social profiles"><div className="space-y-3 text-sm">{partner.instagram ? <SocialRow label="Instagram" value={partner.instagram} /> : null}{partner.tiktok ? <SocialRow label="TikTok" value={partner.tiktok} /> : null}{partner.otherSocial ? <SocialRow label="Other" value={partner.otherSocial} /> : null}{!partner.instagram && !partner.tiktok && !partner.otherSocial ? <EmptyState text="No social profiles provided." /> : null}</div></InfoSection><InfoSection title="About"><p className="whitespace-pre-wrap text-sm leading-6 text-smoke">{partner.introduction ?? "No introduction provided."}</p></InfoSection><AdminReferralLinks partnerId={partner.id} /><InfoSection title="Application history">{applications.length ? <div className="space-y-3">{applications.map((application) => <div key={application.id} className="flex items-center justify-between border-b border-border pb-3 text-sm last:border-0 last:pb-0"><div><p className="font-medium">{application.status}</p><p className="mt-1 text-xs text-smoke">{new Date(application.createdAt).toLocaleString("en")}</p></div><span className="font-mono text-xs text-smoke">{application.id.slice(0, 8)}</span></div>)}</div> : <EmptyState text="No application history." />}</InfoSection></div><aside className="space-y-6"><InfoSection title="Account activation">{invitations[0] ? <><p className="text-sm font-medium">Invitation prepared</p><p className="mt-2 text-xs leading-5 text-smoke">Status: {invitations[0].status}. Expires {new Date(invitations[0].expiresAt).toLocaleDateString("en")}.</p><p className="mt-2 text-xs text-smoke">Delivery service is not configured; no email was sent.</p></> : <EmptyState text="No activation invitation prepared." />}</InfoSection><InfoSection title="Commission settings"><div className="flex items-end justify-between gap-4"><div><p className="text-3xl tracking-[-0.04em]">{currentAgreement ? `${currentAgreement.commissionRate}%` : "—"}</p><p className="mt-2 text-xs text-smoke">{currentAgreement ? `Effective ${currentAgreement.startsAt}` : "No active agreement"}</p></div><button type="button" onClick={() => setCommissionOpen(true)} className="h-9 border border-border px-3 text-xs font-medium hover:bg-[#f6f6f4]">Configure</button></div>{agreements.length ? <div className="mt-6 border-t border-border pt-4"><p className="text-xs uppercase tracking-[0.1em] text-smoke">Agreement history</p><div className="mt-3 space-y-3">{agreements.map((agreement) => <div key={agreement.id} className="text-sm"><div className="flex justify-between gap-3"><span>{agreement.commissionRate}%</span><span className="text-xs text-smoke">{agreement.status}</span></div><p className="mt-1 text-xs text-smoke">{agreement.startsAt}{agreement.endsAt ? ` — ${agreement.endsAt}` : ""} · {agreement.reason}</p></div>)}</div></div> : null}</InfoSection><InfoSection title="Administrative activity">{activity.length ? <div className="space-y-3">{activity.map((entry) => <div key={entry.id} className="text-sm"><p className="font-medium">{entry.action}</p><p className="mt-1 text-xs text-smoke">{new Date(entry.createdAt).toLocaleString("en")} · {entry.actor?.name ?? entry.actor?.email ?? "System"}</p></div>)}</div> : <EmptyState text="No partner activity recorded." />}</InfoSection><InfoSection title="Review history">{reviews.length ? <div className="space-y-3">{reviews.map((review) => <div key={review.id} className="text-sm"><p className="font-medium">{review.action}</p><p className="mt-1 text-xs text-smoke">{new Date(review.createdAt).toLocaleString("en")} · {review.reason ?? "No reason provided"}</p></div>)}</div> : <EmptyState text="No review history." />}</InfoSection></aside></div></div><CommissionDialog partnerId={partner.id} open={commissionOpen} onOpenChange={setCommissionOpen} onSaved={() => void load()} /><PartnerStatusDialog partner={partner} open={statusOpen} onOpenChange={setStatusOpen} onSaved={() => void load()} /></section>
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-t border-border pt-5"><h2 className="text-xs uppercase tracking-[0.12em] text-smoke">{title}</h2><div className="mt-4">{children}</div></section> }
function InfoItem({ label, value }: { label: string; value: string | null }) { return <div><dt className="text-xs text-smoke">{label}</dt><dd className="mt-1 text-sm">{value || "Not provided"}</dd></div> }
function SocialRow({ label, value }: { label: string; value: string }) { return <a href={value.startsWith("http") ? value : undefined} target={value.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0"><span><span className="text-xs text-smoke">{label}</span><br />{value}</span>{value.startsWith("http") ? <ExternalLink className="size-4 text-smoke" /> : null}</a> }
function EmptyState({ text }: { text: string }) { return <p className="text-sm text-smoke">{text}</p> }

function PartnerStatusDialog({ partner, open, onOpenChange, onSaved }: { partner: Partner; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [status, setStatus] = useState(partner.status)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function submit() {
    setSaving(true); setError(null)
    const response = await fetch(`/api/admin/partners/${partner.id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, reason }) })
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
    setSaving(false)
    if (!response.ok) { setError(body?.error?.message ?? "Unable to update status"); return }
    setReason(""); onOpenChange(false); onSaved()
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="rounded-none border-border bg-white p-0 text-ink sm:max-w-[480px]"><DialogHeader className="border-b border-border px-6 py-5 pr-14"><DialogTitle className="font-sans text-lg font-medium">Change partner status</DialogTitle><DialogDescription className="text-sm text-smoke">Every status change is recorded with the administrator and reason.</DialogDescription></DialogHeader><div className="space-y-5 px-6 py-6"><label className="block text-sm"><span className="font-medium">Status</span><select value={status} onChange={(event) => setStatus(event.target.value as Partner["status"])} className="mt-2 h-10 w-full rounded-none border border-border bg-white px-3 text-sm outline-none focus:border-ink"><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select></label><label className="block text-sm"><span className="font-medium">Reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} required className="mt-2 w-full rounded-none border border-border px-3 py-2 text-sm outline-none focus:border-ink" placeholder="Explain this moderation decision" /></label>{error ? <p className="text-xs text-[#8d1d15]" role="alert">{error}</p> : null}</div><DialogFooter className="rounded-none border-t border-border bg-white p-6"><button type="button" disabled={saving} onClick={() => void submit()} className="h-10 bg-charcoal px-4 text-sm font-medium text-white hover:opacity-85 disabled:opacity-50">{saving ? "Saving..." : "Save status"}</button></DialogFooter></DialogContent></Dialog>
}

