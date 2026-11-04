import { NextRequest, NextResponse } from "next/server"

const API_BASE_URL = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")
type RouteContext = { params: Promise<{ path: string[] }> }

async function proxyAdmin(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  const target = `${API_BASE_URL}/v1/admin/${path.join("/")}${request.nextUrl.search}`
  const headers = new Headers()
  for (const header of ["content-type", "cookie", "origin", "referer", "user-agent", "x-forwarded-for", "x-real-ip"]) {
    const value = request.headers.get(header)
    if (value) headers.set(header, value)
  }

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
    cache: "no-store",
  })
  return new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  })
}

export const GET = proxyAdmin
export const POST = proxyAdmin
export const PATCH = proxyAdmin
export const PUT = proxyAdmin
export const DELETE = proxyAdmin

