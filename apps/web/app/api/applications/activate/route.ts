import { NextRequest, NextResponse } from "next/server"

const API_BASE_URL = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")

export async function POST(request: NextRequest) {
  try {
    const upstream = await fetch(`${API_BASE_URL}/v1/applications/activate`, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
      body: await request.arrayBuffer(),
      cache: "no-store",
    })
    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    })
  } catch {
    return NextResponse.json({ status: "error", error: { code: "ACTIVATION_SERVICE_UNAVAILABLE", message: "Service temporarily unavailable." } }, { status: 503 })
  }
}
