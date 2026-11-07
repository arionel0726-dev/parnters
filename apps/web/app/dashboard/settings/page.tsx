"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { Check, LoaderCircle } from "lucide-react"
import { CreatorPageHeader } from "@/components/creator-dashboard/dashboard-ui"
import type { CreatorProfile } from "@/components/creator-dashboard/types"
import { useDashboardLocale } from "@/components/dashboard/dashboard-locale-provider"
import { CreatorSettingsSkeleton } from "@/components/ui/page-skeletons"

type ProfileResponse = { profile: CreatorProfile }
type SocialField = "instagram" | "tiktok" | "otherSocial"

export default function CreatorSettingsPage() {
  const { copy } = useDashboardLocale()
  const statusLabels = {
    active: copy.settings.active,
    suspended: copy.settings.statusSuspended,
    banned: copy.settings.statusBanned,
  } as const
  const socialFields: Array<{ key: SocialField; label: string }> = [
    { key: "instagram", label: copy.settings.instagram },
    { key: "tiktok", label: copy.settings.tiktok },
    { key: "otherSocial", label: copy.settings.otherSocial },
  ]
  const [profile, setProfile] = useState<CreatorProfile | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [phone, setPhone] = useState("")
  const [socials, setSocials] = useState<Record<SocialField, string>>({ instagram: "", tiktok: "", otherSocial: "" })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let current = true
    void fetch("/api/partner/profile", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as ProfileResponse & { error?: { message?: string } }
        if (!response.ok) throw new Error(body.error?.message ?? copy.settings.loadError)
        return body.profile
      })
      .then((value) => {
        if (!current) return
        setProfile(value)
        setDisplayName(value.displayName)
        setPhone(value.phone)
        setSocials({ instagram: value.instagram ?? "", tiktok: value.tiktok ?? "", otherSocial: value.otherSocial ?? "" })
      })
      .catch((loadError) => { if (current) setError(loadError instanceof Error ? loadError.message : copy.settings.loadError) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [copy])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const response = await fetch("/api/partner/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, phone, instagram: socials.instagram || null, tiktok: socials.tiktok || null, otherSocial: socials.otherSocial || null }),
      })
      const body = await response.json() as ProfileResponse & { error?: { message?: string } }
      if (!response.ok || !body.profile) throw new Error(body.error?.message ?? copy.settings.loadError)
      setProfile(body.profile)
      setDisplayName(body.profile.displayName)
      setPhone(body.profile.phone)
      setSocials({ instagram: body.profile.instagram ?? "", tiktok: body.profile.tiktok ?? "", otherSocial: body.profile.otherSocial ?? "" })
      setSaved(true)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.settings.loadError)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <CreatorSettingsSkeleton />

  return (
    <div className="mx-auto w-full max-w-[960px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
      <CreatorPageHeader title={copy.settings.title} description={copy.settings.description} />
      {error ? <p role="alert" className="mt-5 border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {!profile && !error ? <p role="alert" className="mt-5 text-sm text-muted-foreground">{copy.settings.loadError}</p> : null}

      {profile ? <>
        <form onSubmit={saveProfile} className="mt-7 border border-border bg-card p-5 sm:p-7">
          <h2 className="text-lg font-medium">{copy.settings.contact}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.settings.emailNote}</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block text-sm"><span className="font-medium">{copy.settings.fullName}</span><input required minLength={2} maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" className="mt-2 w-full border border-input bg-background px-3 py-2.5 outline-none focus:border-foreground" /></label>
            <label className="block text-sm"><span className="font-medium">{copy.settings.email}</span><input value={profile.email} readOnly aria-readonly="true" className="mt-2 w-full border border-input bg-muted px-3 py-2.5 text-muted-foreground outline-none" /></label>
            <label className="block text-sm sm:col-span-2"><span className="font-medium">{copy.settings.phone}</span><input required minLength={7} maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" placeholder="+373..." className="mt-2 w-full border border-input bg-background px-3 py-2.5 outline-none focus:border-foreground sm:max-w-md" /></label>
          </div>

          <div className="mt-8 border-t border-border pt-6">
            <h3 className="text-base font-medium">{copy.settings.socialProfiles}</h3>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              {socialFields.map(({ key, label }) => <label key={key} className="block text-sm"><span className="font-medium">{label}</span><input type="url" value={socials[key]} onChange={(event) => setSocials((current) => ({ ...current, [key]: event.target.value }))} placeholder="https://" className="mt-2 w-full border border-input bg-background px-3 py-2.5 outline-none focus:border-foreground" /></label>)}
            </div>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{copy.settings.immutable}</p>
            <div className="flex items-center gap-3">
              {saved ? <span className="inline-flex items-center gap-1.5 text-sm text-[#15803d]" role="status"><Check className="size-4" />{copy.settings.saved}</span> : null}
              <button type="submit" disabled={saving} className="inline-flex h-11 min-w-36 items-center justify-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85 disabled:opacity-50">{saving ? <><LoaderCircle className="size-4 animate-spin" />{copy.settings.saving}</> : copy.settings.save}</button>
            </div>
          </div>
        </form>

        <section className="mt-5 grid gap-3 sm:grid-cols-2">
          <Info label={copy.settings.creatorId} value={profile.creatorId} />
          <Info label={copy.settings.partnerType} value={profile.partnerType === "creator" ? copy.settings.creator : copy.settings.referral} />
          <Info label={copy.settings.status} value={statusLabels[profile.status]} />
          <Info label={copy.settings.participationFormat} value={profile.partnershipFormat ? ({ blogger_influencer: copy.settings.blogger, ugc_creator: copy.settings.ugc, both: copy.settings.both } as const)[profile.partnershipFormat] : copy.settings.notSpecified} />
        </section>

        <section className="mt-5 flex flex-col gap-3 border border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div><h2 className="text-base font-medium">{copy.settings.security}</h2><p className="mt-1 text-sm text-muted-foreground">{copy.settings.securityNote}</p></div>
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center justify-center border border-border bg-[#E6F4FE] px-4 text-sm font-medium hover:bg-[#d9effd]">{copy.settings.recoverPassword}</Link>
        </section>
      </> : null}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="border border-border p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-sm font-medium">{value}</p></div>
}
