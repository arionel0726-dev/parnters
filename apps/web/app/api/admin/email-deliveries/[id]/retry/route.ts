import { NextRequest, NextResponse } from "next/server"

const API_BASE_URL = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headers = new Headers()
  for (const name of ["cookie", "origin", "referer", "user-agent", "x-forwarded-for", "x-real-ip"]) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const upstream = await fetch(`${API_BASE_URL}/v1/admin/email-deliveries/${id}/retry`, { method: "POST", headers, cache: "no-store" })
  return new NextResponse(await upstream.arrayBuffer(), { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" } })
}
