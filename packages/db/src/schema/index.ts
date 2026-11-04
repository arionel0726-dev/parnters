import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  pgSequence,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "program_manager",
  "support",
  "finance",
  "analyst",
])
export const partnerTierEnum = pgEnum("partner_tier", ["starter", "growth", "premium"])
export const partnerTypeEnum = pgEnum("partner_type", ["creator", "referral"])
export const partnerStatusEnum = pgEnum("partner_status", ["active", "suspended", "banned"])
export const agreementStatusEnum = pgEnum("agreement_status", ["draft", "active", "expired", "cancelled"])
export const applicationStatusEnum = pgEnum("application_status", ["pending", "approved", "rejected"])
export const applicationLocaleEnum = pgEnum("application_locale", ["ru", "ro"])
export const applicationEmailEventEnum = pgEnum("application_email_event", ["submitted", "in_review", "approved", "rejected"])
export const emailDeliveryStatusEnum = pgEnum("email_delivery_status", ["queued", "sending", "sent", "failed"])
export const creatorAudienceSizeEnum = pgEnum("creator_audience_size", ["under_1000", "1000_5000", "5000_10000", "10000_50000", "50000_100000", "over_100000"])
export const creatorPartnershipFormatEnum = pgEnum("creator_partnership_format", ["blogger_influencer", "ugc_creator", "both"])
export const applicationReviewActionEnum = pgEnum("application_review_action", ["approved", "rejected"])
export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "expired", "revoked"])
export const referralLinkTypeEnum = pgEnum("referral_link_type", ["homepage", "product", "category", "brand"])
export const referralLinkStatusEnum = pgEnum("referral_link_status", ["active", "revoked"])

export const creatorIdSequence = pgSequence("creator_id_seq", { startWith: 1 })

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRoleEnum("role").notNull().default("analyst"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
)

export const partners = pgTable(
  "partners",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: text("creator_id"),
    displayName: text("display_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    dateOfBirth: date("date_of_birth"),
    instagram: text("instagram"),
    tiktok: text("tiktok"),
    otherSocial: text("other_social"),
    introduction: text("introduction"),
    type: partnerTypeEnum("type").notNull().default("creator"),
    tier: partnerTierEnum("tier").notNull().default("starter"),
    status: partnerStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("partners_creator_id_unique").on(table.creatorId),
    uniqueIndex("partners_email_unique").on(table.email),
    index("partners_type_idx").on(table.type),
    index("partners_status_idx").on(table.status),
  ],
)

export const partnerAccounts = pgTable(
  "partner_accounts",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade", onUpdate: "cascade" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("partner_accounts_partner_unique").on(table.partnerId),
    index("partner_accounts_partner_idx").on(table.partnerId),
  ],
)

export const referralLinks = pgTable(
  "referral_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade", onUpdate: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull().default("Моя ссылка"),
    targetProtocol: text("target_protocol").notNull(),
    targetHost: text("target_host").notNull(),
    targetPath: text("target_path").notNull(),
    linkType: referralLinkTypeEnum("link_type").notNull(),
    status: referralLinkStatusEnum("status").notNull().default("active"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("referral_links_code_unique").on(table.code),
    index("referral_links_partner_idx").on(table.partnerId),
    index("referral_links_status_idx").on(table.status),
    check("referral_links_target_protocol_check", sql`${table.targetProtocol} in ('http', 'https')`),
  ],
)

export const apiRateLimits = pgTable(
  "api_rate_limits",
  {
    bucketKey: text("bucket_key").primaryKey(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    requestCount: integer("request_count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("api_rate_limits_expires_at_idx").on(table.expiresAt),
    check("api_rate_limits_request_count_positive", sql`${table.requestCount} >= 1`),
  ],
)

export const creatorApplications = pgTable(
  "creator_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    dateOfBirth: date("date_of_birth").notNull(),
    audienceSize: creatorAudienceSizeEnum("audience_size"),
    partnershipFormat: creatorPartnershipFormatEnum("partnership_format"),
    instagram: text("instagram"),
    tiktok: text("tiktok"),
    otherSocial: text("other_social"),
    contentDescription: text("content_description"),
    partnershipReason: text("partnership_reason"),
    introduction: text("introduction").notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    locale: applicationLocaleEnum("locale").notNull().default("ru"),
    status: applicationStatusEnum("status").notNull().default("pending"),
    reviewStartedAt: timestamp("review_started_at", { withTimezone: true }),
    partnerId: uuid("partner_id").references(() => partners.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    ...timestamps,
  },
  (table) => [
    index("creator_applications_status_idx").on(table.status),
    index("creator_applications_email_idx").on(table.email),
    index("creator_applications_partner_idx").on(table.partnerId),
    uniqueIndex("creator_applications_active_email_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.status} in ('pending', 'approved')`),
    uniqueIndex("creator_applications_active_phone_unique")
      .on(table.phone)
      .where(sql`${table.status} in ('pending', 'approved')`),
  ],
)

export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => creatorApplications.id, { onDelete: "cascade", onUpdate: "cascade" }),
    eventKey: text("event_key").notNull(),
    eventType: applicationEmailEventEnum("event_type").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    status: emailDeliveryStatusEnum("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    firstProviderAttemptAt: timestamp("first_provider_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("email_deliveries_event_key_unique").on(table.eventKey),
    index("email_deliveries_application_idx").on(table.applicationId),
    index("email_deliveries_due_idx").on(table.status, table.nextAttemptAt),
  ],
)

export const partnerInvitations = pgTable(
  "partner_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade", onUpdate: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    tokenHash: text("token_hash").notNull(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("partner_invitations_token_hash_unique").on(table.tokenHash),
    index("partner_invitations_partner_idx").on(table.partnerId),
    index("partner_invitations_status_idx").on(table.status),
  ],
)

export const applicationReviews = pgTable(
  "application_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => creatorApplications.id, { onDelete: "cascade", onUpdate: "cascade" }),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    action: applicationReviewActionEnum("action").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("application_reviews_application_idx").on(table.applicationId),
    index("application_reviews_reviewer_idx").on(table.reviewerUserId),
  ],
)

export const partnerAgreements = pgTable(
  "partner_agreements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade", onUpdate: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull(),
    startsAt: date("starts_at").notNull(),
    endsAt: date("ends_at"),
    reason: text("reason").notNull(),
    status: agreementStatusEnum("status").notNull().default("draft"),
    ...timestamps,
  },
  (table) => [
    index("partner_agreements_partner_idx").on(table.partnerId),
    index("partner_agreements_status_idx").on(table.status),
    check("partner_agreements_commission_rate_range", sql`${table.commissionRate} >= 0 AND ${table.commissionRate} <= 100`),
    check("partner_agreements_date_range", sql`${table.endsAt} IS NULL OR ${table.endsAt} >= ${table.startsAt}`),
  ],
)

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
)

export const authSessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (table) => [
    uniqueIndex("sessions_token_unique").on(table.token),
    index("sessions_user_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
)

export const authAccounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("accounts_provider_account_unique").on(table.providerId, table.accountId),
    index("accounts_user_idx").on(table.userId),
  ],
)

export const authVerifications = pgTable(
  "verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("verifications_identifier_idx").on(table.identifier),
    index("verifications_expires_at_idx").on(table.expiresAt),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Partner = typeof partners.$inferSelect
export type NewPartner = typeof partners.$inferInsert
export type PartnerAccount = typeof partnerAccounts.$inferSelect
export type NewPartnerAccount = typeof partnerAccounts.$inferInsert
export type ReferralLink = typeof referralLinks.$inferSelect
export type NewReferralLink = typeof referralLinks.$inferInsert
export type ApiRateLimit = typeof apiRateLimits.$inferSelect
export type CreatorApplication = typeof creatorApplications.$inferSelect
export type NewCreatorApplication = typeof creatorApplications.$inferInsert
export type EmailDelivery = typeof emailDeliveries.$inferSelect
export type PartnerInvitation = typeof partnerInvitations.$inferSelect
export type NewPartnerInvitation = typeof partnerInvitations.$inferInsert
export type ApplicationReview = typeof applicationReviews.$inferSelect
export type NewApplicationReview = typeof applicationReviews.$inferInsert
export type PartnerAgreement = typeof partnerAgreements.$inferSelect
export type NewPartnerAgreement = typeof partnerAgreements.$inferInsert
export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
export type AuthSession = typeof authSessions.$inferSelect
export type AuthAccount = typeof authAccounts.$inferSelect
export type AuthVerification = typeof authVerifications.$inferSelect
