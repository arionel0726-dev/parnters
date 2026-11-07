import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.WEB_APP_URL || "http://localhost:3000"

  return [
    {
      url: `${siteUrl}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/apply`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ]
}
