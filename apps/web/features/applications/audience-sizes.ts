export const applicationAudienceSizes = [
  "under_1000",
  "1000_5000",
  "5000_10000",
  "10000_50000",
  "50000_100000",
  "over_100000",
] as const

export type ApplicationAudienceSize = (typeof applicationAudienceSizes)[number]
