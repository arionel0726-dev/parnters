import { z } from "zod"

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "error"]),
  service: z.string(),
  database: z
    .object({
      status: z.enum(["connected", "unavailable"]),
    })
    .optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>

export const partnerStatuses = ["active", "suspended", "banned"] as const
export const partnerTypes = ["creator", "referral"] as const
export const applicationStatuses = ["pending", "approved", "rejected"] as const
export const referralLinkTypes = ["homepage", "product", "category", "brand"] as const
export const referralLinkStatuses = ["active", "revoked"] as const
export const referralLinkListStatuses = ["all", ...referralLinkStatuses] as const
export const creatorAudienceSizes = ["under_1000", "1000_5000", "5000_10000", "10000_50000", "50000_100000", "over_100000"] as const
export type CreatorAudienceSize = (typeof creatorAudienceSizes)[number]
export const creatorPartnershipFormats = ["blogger_influencer", "ugc_creator", "both"] as const
export type CreatorPartnershipFormat = (typeof creatorPartnershipFormats)[number]

export function normalizePhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "")
  if (compact.startsWith("00")) return `+${compact.slice(2)}`
  if (compact.startsWith("+")) return `+${compact.slice(1).replace(/\D/g, "")}`
  return `+${compact.replace(/\D/g, "")}`
}

function normalizeSocialUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const socialProfile = z
  .string()
  .trim()
  .max(240, "Ссылка на профиль слишком длинная.")
  .transform(normalizeSocialUrl)
  .optional()
  .refine((value) => {
    if (!value) return true
    try {
      const url = new URL(value)
      return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".") && !url.username && !url.password
    } catch {
      return false
    }
  }, "Укажите корректную ссылку на профиль.")

export const creatorApplicationInputSchema = z
  .object({
    fullName: z.string().trim().min(2, "Укажите имя и фамилию.").max(120, "Имя слишком длинное."),
    email: z.email("Укажите корректный email.").transform((value) => value.trim().toLowerCase()),
    phone: z
      .string()
      .trim()
      .min(7, "Укажите номер телефона.")
      .max(32, "Номер телефона слишком длинный.")
      .transform(normalizePhone)
      .refine((value) => /^\+[1-9]\d{7,14}$/.test(value), "Укажите телефон в формате E.164, например +373...")
      .transform((value) => value),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату рождения.")
      .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Укажите корректную дату рождения.")
      .refine((value) => value <= new Date().toISOString().slice(0, 10), "Дата рождения не может быть в будущем."),
    audienceSize: z.enum(creatorAudienceSizes),
    partnershipFormat: z.enum(creatorPartnershipFormats),
    instagram: socialProfile,
    tiktok: socialProfile,
    otherSocial: socialProfile,
    contentDescription: z.string().trim().min(1, "Опишите, какой контент вы создаёте.").max(1000, "Описание контента слишком длинное."),
    partnershipReason: z.string().trim().min(1, "Расскажите, почему хотите сотрудничать с Vizaje-Nica.").max(1000, "Ответ слишком длинный."),
    consent: z.literal(true, "Нужно согласиться на обработку данных."),
    locale: z.enum(["ru", "ro"]).default("ru"),
  })
  .superRefine((value, context) => {
    if (!value.instagram && !value.tiktok && !value.otherSocial) {
      context.addIssue({
        code: "custom",
        path: ["instagram"],
        message: "Укажите хотя бы один социальный профиль.",
      })
    }
  })

export type CreatorApplicationInput = z.infer<typeof creatorApplicationInputSchema>

export const creatorActivationInputSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i, "Некорректная ссылка активации."),
  password: z.string().min(12).max(128),
})

export const applicationReviewInputSchema = z.object({
  reason: z.string().trim().min(3, "Укажите причину.").max(1000, "Причина слишком длинная."),
})

export const partnerStatusUpdateSchema = z.object({
  status: z.enum(partnerStatuses),
  reason: z.string().trim().min(3, "Укажите причину.").max(1000, "Причина слишком длинная."),
})

export const partnerAgreementInputSchema = z.object({
  commissionRate: z.coerce.number().finite().min(0).max(100),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату начала."),
  reason: z.string().trim().min(3, "Укажите причину.").max(1000, "Причина слишком длинная."),
})

export const applicationListQuerySchema = z.object({
  status: z.enum(applicationStatuses).default("pending"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
})

export const partnerListQuerySchema = z.object({
  status: z.enum(partnerStatuses).optional(),
  type: z.enum(partnerTypes).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
})

export const referralLinkCreateSchema = z.object({
  linkType: z.enum(referralLinkTypes),
  targetUrl: z.string().trim().min(1, "Укажите ссылку на Vizaje-Nica.").max(2048, "Ссылка слишком длинная."),
  label: z.string().trim().min(1, "Укажите название ссылки.").max(80, "Название ссылки не должно превышать 80 символов.").optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
})

export const referralLinkRenameSchema = z.object({
  label: z.string().trim().min(1, "Укажите название ссылки.").max(80, "Название ссылки не должно превышать 80 символов."),
})

export const referralLinkListQuerySchema = z.object({
  status: z.enum(referralLinkListStatuses).default("all"),
})

export const referralCodeInputSchema = z.object({
  code: z.string().trim().regex(/^[A-HJ-NP-Z2-9]{10}$/, "Некорректный referral code."),
})

export const referralLinkResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string().regex(/^[A-HJ-NP-Z2-9]{10}$/),
  label: z.string().min(1).max(80),
  targetProtocol: z.enum(["http", "https"]),
  targetHost: z.string(),
  targetPath: z.string(),
  linkType: z.enum(referralLinkTypes),
  status: z.enum(referralLinkStatuses),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  isExpired: z.boolean(),
  shortUrl: z.string().url(),
  targetUrl: z.string().url(),
})

export type ReferralLinkCreateInput = z.infer<typeof referralLinkCreateSchema>
export type ReferralLinkRenameInput = z.infer<typeof referralLinkRenameSchema>

const editableProfileSocial = z.union([socialProfile, z.null()]).optional()

export const creatorProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(2, "Укажите имя и фамилию.").max(120, "Имя слишком длинное."),
  phone: z
    .string()
    .trim()
    .min(7, "Укажите номер телефона.")
    .max(32, "Номер телефона слишком длинный.")
    .transform(normalizePhone)
    .refine((value) => /^\+[1-9]\d{7,14}$/.test(value), "Укажите телефон в международном формате."),
  instagram: editableProfileSocial,
  tiktok: editableProfileSocial,
  otherSocial: editableProfileSocial,
}).strict()

export const creatorProfileResponseSchema = z.object({
  creatorId: z.string(),
  displayName: z.string(),
  email: z.email(),
  phone: z.string(),
  instagram: z.string().nullable(),
  tiktok: z.string().nullable(),
  otherSocial: z.string().nullable(),
  partnerType: z.enum(partnerTypes),
  status: z.enum(partnerStatuses),
  partnershipFormat: z.enum(creatorPartnershipFormats).nullable(),
  agreement: z.object({
    id: z.string().uuid(),
    commissionRate: z.string(),
    startsAt: z.string(),
    endsAt: z.string().nullable(),
  }).nullable(),
})

export const creatorDashboardResponseSchema = z.object({
  profile: creatorProfileResponseSchema,
  links: z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    revoked: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
  }),
})

export type CreatorProfileUpdateInput = z.infer<typeof creatorProfileUpdateSchema>
export type CreatorProfileResponse = z.infer<typeof creatorProfileResponseSchema>
export type CreatorDashboardResponse = z.infer<typeof creatorDashboardResponseSchema>

const referralOrderEventBaseSchema = z.object({
  eventId: z.string().uuid(),
  eventVersion: z.literal("v1"),
  occurredAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Укажите корректную дату события."),
  orderId: z.string().trim().min(1).max(128),
  referralCode: z.string().trim().regex(/^[A-HJ-NP-Z2-9]{10}$/),
  creatorId: z.string().regex(/^CRE-\d{6}$/),
  amount: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/, "Сумма должна быть десятичной строкой с максимум двумя знаками после запятой."),
  currency: z.string().regex(/^[A-Z]{3}$/),
})

export const orderCreatedEventV1Schema = referralOrderEventBaseSchema.extend({
  eventType: z.literal("order.created"),
})

export const orderUpdatedEventV1Schema = referralOrderEventBaseSchema.extend({
  eventType: z.literal("order.updated"),
})

export const orderCancelledEventV1Schema = referralOrderEventBaseSchema.extend({
  eventType: z.literal("order.cancelled"),
})

export const referralOrderEventV1Schema = z.discriminatedUnion("eventType", [
  orderCreatedEventV1Schema,
  orderUpdatedEventV1Schema,
  orderCancelledEventV1Schema,
])

export type OrderCreatedEventV1 = z.infer<typeof orderCreatedEventV1Schema>
export type OrderUpdatedEventV1 = z.infer<typeof orderUpdatedEventV1Schema>
export type OrderCancelledEventV1 = z.infer<typeof orderCancelledEventV1Schema>
