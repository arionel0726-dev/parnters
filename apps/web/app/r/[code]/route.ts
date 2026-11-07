import { NextResponse } from "next/server"

const API_BASE_URL = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")
const SERVICE_TOKEN = process.env.REFERRAL_SERVICE_TOKEN ?? (process.env.NODE_ENV === "production" ? "" : "vizaje-referral-service-local-development-token-2026")

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!SERVICE_TOKEN) return new NextResponse("Referral service unavailable", { status: 503 })
  const requestUrl = new URL(_request.url)
  const locale = requestUrl.searchParams.get("lang")
  const response = await fetch(`${API_BASE_URL}/v1/internal/referral-links/click`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-service-token": SERVICE_TOKEN, ...(locale === "ru" || locale === "ro" ? { "x-referral-locale": locale } : {}) },
    body: JSON.stringify({ code }),
    cache: "no-store",
  })

  if (!response.ok) return new NextResponse("Referral link unavailable", { status: 404 })
  const body = await response.json() as { valid?: boolean; link?: { targetUrl: string } }
  if (!body.valid || !body.link?.targetUrl) return new NextResponse("Referral link unavailable", { status: 404 })
  return NextResponse.redirect(body.link.targetUrl, 307)
}
