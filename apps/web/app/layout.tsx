import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Providers } from "./providers";
import { localeCookieName, normalizeLocale } from "@/lib/translations";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vizaje Partners",
    template: "%s · Vizaje Partners",
  },
  description: "A focused workspace for building the Vizaje partner program.",
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
