import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Providers } from "./providers";
import { localeCookieName, normalizeLocale } from "@/lib/translations";
import "./globals.css";
import "./dashboard/creator-dashboard.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.WEB_APP_URL || "http://localhost:3000"),
  title: {
    default: "Vizaje Partners",
    template: "%s · Vizaje Partners",
  },
  description: "Партнёрская программа Vizaje-Nica для креаторов: создавайте рекомендации, делитесь ссылками и развивайте свой контент.",
  keywords: ["Vizaje-Nica", "Vizaje Partners", "партнёрская программа", "креаторы", "реферальные ссылки"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    alternateLocale: ["ro_RO"],
    siteName: "Vizaje Partners",
    title: "Vizaje Partners — партнёрская программа Vizaje-Nica",
    description: "Создавайте рекомендации, делитесь ссылками на продукты Vizaje-Nica и развивайте свой контент.",
    images: [{ url: "/android-chrome-512x512.png", width: 512, height: 512, alt: "Vizaje Partners" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vizaje Partners — партнёрская программа Vizaje-Nica",
    description: "Создавайте рекомендации, делитесь ссылками на продукты Vizaje-Nica и развивайте свой контент.",
    images: ["/android-chrome-512x512.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value)

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
