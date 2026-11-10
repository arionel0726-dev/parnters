import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.WEB_APP_URL || "http://localhost:3000"

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/app",
        "/app/",
        "/dashboard",
        "/dashboard/",
        "/api",
        "/api/",
        "/login",
        "/activate",
        "/forgot-password",
        "/reset-password",
        "/link",
        "/link/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
