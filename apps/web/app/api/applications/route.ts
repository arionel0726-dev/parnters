import { NextRequest, NextResponse } from "next/server"

const API_BASE_URL = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")

export async function POST(request: NextRequest) {
  try {
    const headers = new Headers({ "content-type": request.headers.get("content-type") ?? "application/json" })
    for (const header of ["x-forwarded-for", "x-real-ip", "user-agent"]) {
      const value = request.headers.get(header)
      if (value) headers.set(header, value)
    }
    const upstream = await fetch(`${API_BASE_URL}/v1/applications`, {
      method: "POST",
      headers,
      body: await request.arrayBuffer(),
      cache: "no-store",
    })

    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    })
  } catch {
    return NextResponse.json({ status: "error", error: { code: "APPLICATION_SERVICE_UNAVAILABLE", message: "Сервис временно недоступен. Попробуйте ещё раз." } }, { status: 503 })
  }
}

