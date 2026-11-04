"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarDays, ChevronDown, Globe, Info } from "lucide-react"
import { gsap } from "gsap"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { applicationAudienceSizes, type ApplicationAudienceSize } from "./audience-sizes"
import { translations, type Locale } from "@/lib/translations"

const partnershipFormats = ["blogger_influencer", "ugc_creator", "both"] as const
type PartnershipFormat = (typeof partnershipFormats)[number]

type Draft = {
  fullName: string
  email: string
  countryCode: string
  phone: string
  dateOfBirth: string
  audienceSize: ApplicationAudienceSize | ""
  instagram: string
  tiktok: string
  otherSocial: string
  partnershipFormat: PartnershipFormat | ""
  contentDescription: string
  partnershipReason: string
  consent: boolean
}

type FieldName = keyof Draft
type FieldErrors = Partial<Record<FieldName, string>>
type StoredDraft = Omit<Draft, "partnershipFormat" | "contentDescription" | "partnershipReason"> & {
  partnershipFormat?: PartnershipFormat | ""
  contentDescription?: string
  partnershipReason?: string
  introduction?: string
}
type StoredApplicationState = { version: 1; step: number; draft: StoredDraft }

const draftStorageKey = "vizaje-application-draft-v1"
const audienceSizeSet = new Set<string>(applicationAudienceSizes)
const partnershipFormatSet = new Set<string>(partnershipFormats)

const initialDraft: Draft = {
  fullName: "",
  email: "",
  countryCode: "+373",
  phone: "",
  dateOfBirth: "",
  audienceSize: "",
  instagram: "",
  tiktok: "",
  otherSocial: "",
  partnershipFormat: "",
  contentDescription: "",
  partnershipReason: "",
  consent: false,
}

function buildPhone(countryCode: string, input: string) {
  let digits = input.replace(/\D/g, "")
  const countryDigits = countryCode.replace(/\D/g, "")
  if (digits.startsWith(countryDigits)) digits = digits.slice(countryDigits.length)
  digits = digits.replace(/^0+/, "")
  return `${countryCode}${digits}`
}

function normalizeProfileUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(normalized)
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".") && !url.username && !url.password
      ? normalized
      : null
  } catch {
    return null
  }
}

function TikTokIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" focusable="false">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.23V2h-3.47v13.67a2.89 2.89 0 0 1-5.01 1.93 2.89 2.89 0 0 1 2.31-4.77c.3 0 .6.05.89.14V9.43a6.48 6.48 0 0 0-.89-.06A6.39 6.39 0 0 0 4 19.67a6.39 6.39 0 0 0 10.76-4.6V8.04a8.17 8.17 0 0 0 4.83 1.57V6.69Z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" focusable="false">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  )
}

function isStoredApplicationState(value: unknown): value is StoredApplicationState {
  if (!value || typeof value !== "object") return false
  const state = value as Partial<StoredApplicationState>
  const draft = state.draft
  if (state.version !== 1 || ![1, 2, 3].includes(state.step ?? 0) || !draft || typeof draft !== "object") return false

  const commonFieldsAreValid = typeof draft.fullName === "string"
    && typeof draft.email === "string"
    && typeof draft.phone === "string"
    && typeof draft.dateOfBirth === "string"
    && (draft.audienceSize === "" || audienceSizeSet.has(draft.audienceSize))
    && typeof draft.instagram === "string"
    && typeof draft.tiktok === "string"
    && typeof draft.otherSocial === "string"
    && typeof draft.consent === "boolean"

  const stepThreeFieldsAreValid = (draft.partnershipFormat === undefined || draft.partnershipFormat === "" || partnershipFormatSet.has(draft.partnershipFormat))
    && (draft.contentDescription === undefined || typeof draft.contentDescription === "string")
    && (draft.partnershipReason === undefined || typeof draft.partnershipReason === "string")
    && (draft.introduction === undefined || typeof draft.introduction === "string")

  return commonFieldsAreValid && stepThreeFieldsAreValid
}

export function ApplicationForm({ locale }: { locale: Locale }) {
  const copy = translations[locale].applicationForm
  const router = useRouter()
  const contentRef = useRef<HTMLDivElement>(null)
  const visualRef = useRef<HTMLElement>(null)
  const previousStepRef = useRef<number | null>(null)
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [step, setStep] = useState(1)
  const [dateFocused, setDateFocused] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [isDraftRestored, setIsDraftRestored] = useState(false)

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(draftStorageKey)
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (isStoredApplicationState(parsed)) {
          const { introduction: legacyIntroduction, ...savedDraft } = parsed.draft
          // Restore the saved multi-step draft after mount to keep server and initial client markup in sync.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setDraft({
            ...initialDraft,
            ...savedDraft,
            partnershipFormat: savedDraft.partnershipFormat ?? "",
            contentDescription: savedDraft.contentDescription ?? legacyIntroduction ?? "",
            partnershipReason: savedDraft.partnershipReason ?? "",
            countryCode: "+373",
          })
          setStep(parsed.step)
        } else {
          window.sessionStorage.removeItem(draftStorageKey)
        }
      }
    } catch {
      try {
        window.sessionStorage.removeItem(draftStorageKey)
      } catch {
        // Session storage may be unavailable in restricted browser contexts.
      }
    } finally {
      setIsDraftRestored(true)
    }
  }, [])

  useEffect(() => {
    if (!isDraftRestored) return

    try {
      if (submitted) {
        window.sessionStorage.removeItem(draftStorageKey)
      } else {
        const saved: StoredApplicationState = { version: 1, step, draft }
        window.sessionStorage.setItem(draftStorageKey, JSON.stringify(saved))
      }
    } catch {
      // Keep the form usable if session storage is unavailable.
    }
  }, [draft, isDraftRestored, step, submitted])

  useEffect(() => {
    if (!isDraftRestored) return

    const previousStep = previousStepRef.current
    previousStepRef.current = step
    if (previousStep === null || previousStep === step) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const direction = step > previousStep ? 1 : -1
    const timeline = gsap.timeline()

    if (contentRef.current) {
      timeline.fromTo(
        contentRef.current,
        { autoAlpha: 0, y: direction * 8 },
        { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out", clearProps: "transform,opacity,visibility" },
        0,
      )
    }

    if (visualRef.current) {
      timeline.fromTo(
        visualRef.current,
        { autoAlpha: 0, scale: 0.992 },
        { autoAlpha: 1, scale: 1, duration: 0.62, ease: "power3.out", clearProps: "transform,opacity,visibility" },
        0,
      )
    }

    return () => {
      timeline.kill()
    }
  }, [isDraftRestored, step])

  function updateDraft<K extends FieldName>(field: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      const next = { ...current }
      delete next[field]
      if (field === "instagram" || field === "tiktok" || field === "otherSocial") {
        delete next.instagram
      }
      return next
    })
    setFormError(null)
  }

  function validateStepOne() {
    const next: FieldErrors = {}
    const fullName = draft.fullName.trim()
    const email = draft.email.trim()
    const phone = buildPhone(draft.countryCode, draft.phone)
    const today = new Date().toISOString().slice(0, 10)

    if (fullName.length < 2) next.fullName = copy.step1.errors.fullName
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = copy.step1.errors.email
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) next.phone = copy.step1.errors.phone
    if (!draft.dateOfBirth || Number.isNaN(Date.parse(`${draft.dateOfBirth}T00:00:00.000Z`)) || draft.dateOfBirth > today) {
      next.dateOfBirth = copy.step1.errors.dateOfBirth
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  function validateStepTwo() {
    const next: FieldErrors = {}
    const profiles: Array<["instagram" | "tiktok" | "otherSocial", string]> = [
      ["instagram", draft.instagram],
      ["tiktok", draft.tiktok],
      ["otherSocial", draft.otherSocial],
    ]
    if (!profiles.some(([, value]) => value.trim())) next.instagram = copy.step2.profileRequired
    for (const [field, value] of profiles) {
      if (!value.trim()) continue
      if (value.trim().length > 240) next[field] = copy.step2.profileTooLong
      else if (!normalizeProfileUrl(value)) next[field] = copy.step2.profileInvalid
    }
    if (!draft.audienceSize) next.audienceSize = copy.step2.audienceRequired
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function validateStepThree() {
    const next: FieldErrors = {}
    if (!draft.partnershipFormat) next.partnershipFormat = copy.step3.formatRequired
    if (!draft.contentDescription.trim()) next.contentDescription = copy.step3.contentRequired
    if (draft.contentDescription.trim().length > 1000) next.contentDescription = copy.step3.contentMax
    if (!draft.partnershipReason.trim()) next.partnershipReason = copy.step3.reasonRequired
    if (draft.partnershipReason.trim().length > 1000) next.partnershipReason = copy.step3.reasonMax
    if (!draft.consent) next.consent = copy.step3.consentRequired
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    if (step === 1) {
      if (validateStepOne()) setStep(2)
      return
    }

    if (step === 2) {
      if (validateStepTwo()) setStep(3)
      return
    }

    if (!validateStepThree()) return

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: draft.fullName.trim(),
          email: draft.email.trim(),
          phone: buildPhone(draft.countryCode, draft.phone),
          dateOfBirth: draft.dateOfBirth,
          instagram: draft.instagram.trim() || undefined,
          tiktok: draft.tiktok.trim() || undefined,
          otherSocial: draft.otherSocial.trim() || undefined,
          audienceSize: draft.audienceSize,
          partnershipFormat: draft.partnershipFormat,
          contentDescription: draft.contentDescription.trim(),
          partnershipReason: draft.partnershipReason.trim(),
          consent: draft.consent,
          locale,
        }),
      })
      const body = (await response.json().catch(() => null)) as
        | { error?: { code?: string } }
        | { application?: { id: string } }
        | null

      if (!response.ok) {
        const errorCode = body && "error" in body ? body.error?.code : undefined
        setFormError(errorCode === "DUPLICATE_APPLICATION" ? copy.duplicateError : response.status === 503 ? copy.serviceError : copy.genericError)
        return
      }

      setSubmitted(true)
      try {
        window.sessionStorage.removeItem(draftStorageKey)
      } catch {
        // Keep success navigation working if session storage is unavailable.
      }
      router.push("/apply/success")
    } catch {
      setFormError(copy.serviceError)
    } finally {
      setIsSubmitting(false)
    }
  }

  const stepTitle = step === 1 ? copy.step1.title : step === 2 ? copy.step2.title : copy.step3.title
  const stepDescription = step === 1 ? copy.step1.description : step === 2 ? copy.step2.description : copy.step3.description
  const imageSrc = step === 2
    ? "/brand/apply/step-2-byredo.png"
    : step === 3
      ? "/brand/apply/step-3-lipstick.png"
      : "/brand/apply/step-1-dispenser.png"

  return (
    <div className="partners-apply__layout">
      <section className="partners-apply__panel" aria-labelledby="application-step-title">
        <div className="partners-apply__content" ref={contentRef}>
          {submitted ? (
            <div className="partners-apply__success" role="status">
              <p className="partners-apply__step">{copy.stepLabel.replace("{step}", "3")}</p>
              <h1 className="partners-apply__title">{copy.successTitle}</h1>
              <p className="partners-apply__description">{copy.successDescription}</p>
              <Link className="partners-apply__button partners-apply__success-link" href="/">
                {copy.home}
              </Link>
            </div>
          ) : (
            <>
              <p className="partners-apply__step">{copy.stepLabel.replace("{step}", String(step))}</p>
              <h1 className="partners-apply__title" id="application-step-title">{stepTitle}</h1>
              {stepDescription ? <p className="partners-apply__description">{stepDescription}</p> : null}

              <form className={`partners-apply__form${step === 2 ? " partners-apply__form--step2" : ""}${step === 3 ? " partners-apply__form--step3" : ""}`} onSubmit={handleSubmit} noValidate>
                {step === 1 ? <p className="partners-apply__required-note">{copy.step1.requiredNote}</p> : null}

                {step === 1 ? (
                  <div className="partners-apply__fields">
                    <div className="partners-apply__field">
                      <label className="sr-only" htmlFor="fullName">{copy.step1.fullName}</label>
                      <input
                        id="fullName"
                        name="fullName"
                        type="text"
                        autoComplete="name"
                        required
                        value={draft.fullName}
                        onChange={(event) => updateDraft("fullName", event.target.value)}
                        placeholder={copy.step1.fullNamePlaceholder}
                        aria-invalid={Boolean(errors.fullName)}
                        aria-describedby={errors.fullName ? "fullName-error" : undefined}
                        className="partners-apply__input"
                      />
                      {errors.fullName ? <p className="partners-apply__error" id="fullName-error" role="alert">{errors.fullName}</p> : null}
                    </div>

                    <div className="partners-apply__field">
                      <label className="sr-only" htmlFor="email">{copy.step1.email}</label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        required
                        value={draft.email}
                        onChange={(event) => updateDraft("email", event.target.value)}
                        placeholder={copy.step1.emailPlaceholder}
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? "email-error" : undefined}
                        className="partners-apply__input"
                      />
                      {errors.email ? <p className="partners-apply__error" id="email-error" role="alert">{errors.email}</p> : null}
                    </div>

                    <div className="partners-apply__field">
                      <div className="partners-apply__phone">
                        <label className="sr-only" htmlFor="countryCode">{copy.step1.countryCode}</label>
                        <div className="partners-apply__country-wrap">
                          <select
                            id="countryCode"
                            name="countryCode"
                            aria-label={copy.step1.countryCode}
                            value={draft.countryCode}
                            onChange={(event) => updateDraft("countryCode", event.target.value)}
                            className="partners-apply__country"
                          >
                            <option value="+373">+373</option>
                          </select>
                          <ChevronDown aria-hidden="true" className="partners-apply__country-icon" />
                        </div>
                        <label className="sr-only" htmlFor="phone">{copy.step1.phone}</label>
                        <input
                          id="phone"
                          name="phone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel-national"
                          required
                          value={draft.phone}
                          onChange={(event) => updateDraft("phone", event.target.value)}
                          placeholder={copy.step1.phonePlaceholder}
                          aria-invalid={Boolean(errors.phone)}
                          aria-describedby={errors.phone ? "phone-error" : undefined}
                          className="partners-apply__input partners-apply__phone-input"
                        />
                      </div>
                      {errors.phone ? <p className="partners-apply__error" id="phone-error" role="alert">{errors.phone}</p> : null}
                    </div>

                    <div className="partners-apply__field partners-apply__date-field">
                      <label className="sr-only" htmlFor="dateOfBirth">{copy.step1.dateOfBirth}</label>
                      <input
                        id="dateOfBirth"
                        name="dateOfBirth"
                        type={dateFocused || draft.dateOfBirth ? "date" : "text"}
                        autoComplete="bday"
                        max={new Date().toISOString().slice(0, 10)}
                        required
                        value={draft.dateOfBirth}
                        onFocus={() => setDateFocused(true)}
                        onBlur={(event) => { if (!event.currentTarget.value) setDateFocused(false) }}
                        onChange={(event) => updateDraft("dateOfBirth", event.target.value)}
                        placeholder={copy.step1.datePlaceholder}
                        aria-invalid={Boolean(errors.dateOfBirth)}
                        aria-describedby={errors.dateOfBirth ? "dateOfBirth-error" : undefined}
                        className="partners-apply__input partners-apply__input--date"
                      />
                      {!dateFocused && !draft.dateOfBirth ? <CalendarDays aria-hidden="true" className="partners-apply__calendar-icon" /> : null}
                      {errors.dateOfBirth ? <p className="partners-apply__error" id="dateOfBirth-error" role="alert">{errors.dateOfBirth}</p> : null}
                    </div>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="partners-apply__socials">
                    <div className="partners-apply__social-list">
                      <div className="partners-apply__social-field">
                        <div className="partners-apply__social-icon"><InstagramIcon /></div>
                        <div className="partners-apply__social-content">
                          <label className="partners-apply__social-label" htmlFor="instagram">{copy.step2.instagram}</label>
                          <input id="instagram" name="instagram" type="url" inputMode="url" autoComplete="url" value={draft.instagram} onChange={(event) => updateDraft("instagram", event.target.value)} placeholder={copy.step2.instagramPlaceholder} aria-invalid={Boolean(errors.instagram)} aria-describedby={errors.instagram ? "instagram-error" : undefined} className="partners-apply__social-input" />
                          {errors.instagram ? <p className="partners-apply__error" id="instagram-error" role="alert">{errors.instagram}</p> : null}
                        </div>
                      </div>
                      <div className="partners-apply__social-field">
                        <div className="partners-apply__social-icon"><TikTokIcon /></div>
                        <div className="partners-apply__social-content">
                          <label className="partners-apply__social-label" htmlFor="tiktok">{copy.step2.tiktok}</label>
                          <input id="tiktok" name="tiktok" type="url" inputMode="url" autoComplete="url" value={draft.tiktok} onChange={(event) => updateDraft("tiktok", event.target.value)} placeholder={copy.step2.tiktokPlaceholder} aria-invalid={Boolean(errors.tiktok)} aria-describedby={errors.tiktok ? "tiktok-error" : undefined} className="partners-apply__social-input" />
                          {errors.tiktok ? <p className="partners-apply__error" id="tiktok-error" role="alert">{errors.tiktok}</p> : null}
                        </div>
                      </div>
                      <div className="partners-apply__social-field">
                        <div className="partners-apply__social-icon"><Globe aria-hidden="true" /></div>
                        <div className="partners-apply__social-content">
                          <label className="partners-apply__social-label" htmlFor="otherSocial">{copy.step2.otherSocial}</label>
                          <input id="otherSocial" name="otherSocial" type="url" inputMode="url" autoComplete="url" value={draft.otherSocial} onChange={(event) => updateDraft("otherSocial", event.target.value)} placeholder={copy.step2.otherSocialPlaceholder} aria-invalid={Boolean(errors.otherSocial)} aria-describedby={errors.otherSocial ? "otherSocial-error" : undefined} className="partners-apply__social-input" />
                          {errors.otherSocial ? <p className="partners-apply__error" id="otherSocial-error" role="alert">{errors.otherSocial}</p> : null}
                        </div>
                      </div>
                    </div>

                    <div className="partners-apply__audience">
                      <label className="partners-apply__audience-label" htmlFor="audienceSize">{copy.step2.audienceLabel}</label>
                      <div className="partners-apply__select-wrap">
                        <select id="audienceSize" name="audienceSize" required value={draft.audienceSize} onChange={(event) => updateDraft("audienceSize", event.target.value as ApplicationAudienceSize | "")} aria-invalid={Boolean(errors.audienceSize)} aria-describedby={errors.audienceSize ? "audienceSize-error" : undefined} className="partners-apply__select">
                          <option value="" disabled>{copy.step2.audiencePlaceholder}</option>
                          {applicationAudienceSizes.map((value, index) => <option key={value} value={value}>{copy.step2.audienceOptions[index]}</option>)}
                        </select>
                        <ChevronDown aria-hidden="true" className="partners-apply__select-chevron" />
                      </div>
                      {errors.audienceSize ? <p className="partners-apply__error" id="audienceSize-error" role="alert">{errors.audienceSize}</p> : null}
                      <p className="partners-apply__social-helper"><Info aria-hidden="true" />{copy.step2.helper}</p>
                    </div>
                  </div>
                ) : null}

                {step === 3 ? (
                  <div className="apply-collab">
                    <fieldset className="apply-collab__format" aria-describedby={errors.partnershipFormat ? "partnershipFormat-error" : undefined}>
                      <legend className="apply-collab__label">{copy.step3.formatLabel} <span aria-hidden="true">*</span></legend>
                      <div className="apply-collab__radio-group">
                        {partnershipFormats.map((format, index) => (
                          <label className="apply-collab__radio" key={format}>
                            <input
                              type="radio"
                              name="partnershipFormat"
                              value={format}
                              checked={draft.partnershipFormat === format}
                              onChange={() => updateDraft("partnershipFormat", format)}
                              aria-invalid={Boolean(errors.partnershipFormat)}
                              required
                            />
                            <span>{copy.step3.formatOptions[index]}</span>
                          </label>
                        ))}
                      </div>
                      {errors.partnershipFormat ? <p className="apply-collab__error" id="partnershipFormat-error" role="alert">{errors.partnershipFormat}</p> : null}
                    </fieldset>

                    <div className="apply-collab__fields">
                      <div className="apply-collab__field">
                        <label className="apply-collab__field-label" htmlFor="contentDescription">{copy.step3.contentLabel} <span aria-hidden="true">*</span></label>
                        <textarea
                          id="contentDescription"
                          name="contentDescription"
                          rows={4}
                          required
                          maxLength={1000}
                          value={draft.contentDescription}
                          onChange={(event) => updateDraft("contentDescription", event.target.value)}
                          placeholder={copy.step3.contentPlaceholder}
                          aria-invalid={Boolean(errors.contentDescription)}
                          aria-describedby={errors.contentDescription ? "contentDescription-error" : undefined}
                          className="apply-collab__textarea"
                        />
                        {errors.contentDescription ? <p className="apply-collab__error" id="contentDescription-error" role="alert">{errors.contentDescription}</p> : null}
                      </div>
                      <div className="apply-collab__field">
                        <label className="apply-collab__field-label" htmlFor="partnershipReason">{copy.step3.reasonLabel} <span aria-hidden="true">*</span></label>
                        <textarea
                          id="partnershipReason"
                          name="partnershipReason"
                          rows={4}
                          required
                          maxLength={1000}
                          value={draft.partnershipReason}
                          onChange={(event) => updateDraft("partnershipReason", event.target.value)}
                          placeholder={copy.step3.reasonPlaceholder}
                          aria-invalid={Boolean(errors.partnershipReason)}
                          aria-describedby={errors.partnershipReason ? "partnershipReason-error" : undefined}
                          className="apply-collab__textarea"
                        />
                        {errors.partnershipReason ? <p className="apply-collab__error" id="partnershipReason-error" role="alert">{errors.partnershipReason}</p> : null}
                      </div>
                    </div>

                    <div className="apply-collab__consent">
                      <input
                        id="consent"
                        name="consent"
                        type="checkbox"
                        required
                        checked={draft.consent}
                        onChange={(event) => updateDraft("consent", event.target.checked)}
                        aria-invalid={Boolean(errors.consent)}
                        aria-describedby={errors.consent ? "consent-error" : undefined}
                        className="apply-collab__checkbox-input"
                      />
                      <div className="apply-collab__consent-copy">
                        <p><label htmlFor="consent">{copy.step3.consentBeforeLink}</label>{" "}<Link href="/#footer">{copy.step3.privacyLink}</Link>{copy.step3.consentAfterLink}</p>
                        {errors.consent ? <p className="partners-apply__error" id="consent-error" role="alert">{errors.consent}</p> : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {formError ? <p className="partners-apply__form-error" role="alert">{formError}</p> : null}

                <div className={`partners-apply__actions${step === 2 ? " partners-apply__actions--step2" : ""}${step === 3 ? " apply-collab__actions" : ""}`}>
                  {step > 1 ? (
                    <button type="button" className="partners-apply__back" onClick={() => { setFormError(null); setErrors({}); setStep((current) => current - 1) }}>
                      {copy.back}
                    </button>
                  ) : null}
                  <button type="submit" className="partners-apply__button" disabled={isSubmitting}>
                    {isSubmitting ? copy.submitting : step < 3 ? copy.continue : copy.submit}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </section>

      <aside className="partners-apply__visual" aria-hidden="true" ref={visualRef}>
        <Image
          src={imageSrc}
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 0px"
          className="partners-apply__image"
        />
      </aside>
    </div>
  )
}
