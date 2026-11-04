export type CreatorPartnershipFormat = "blogger_influencer" | "ugc_creator" | "both"

export type CreatorProfile = {
  creatorId: string
  displayName: string
  email: string
  phone: string
  instagram: string | null
  tiktok: string | null
  otherSocial: string | null
  partnerType: "creator" | "referral"
  status: "active" | "suspended" | "banned"
  partnershipFormat: CreatorPartnershipFormat | null
  agreement: {
    id: string
    commissionRate: string
    startsAt: string
    endsAt: string | null
  } | null
}

export type CreatorDashboardData = {
  profile: CreatorProfile
  links: {
    total: number
    active: number
    revoked: number
    expired: number
  }
}
