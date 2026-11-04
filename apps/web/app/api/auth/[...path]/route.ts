import { NextRequest, NextResponse } from "next/server"

const API_BASE_URL = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")

type RouteContext = { params: Promise<{ path: string[] }> }

async function proxyAuth(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  const target = `${API_BASE_URL}/v1/auth/${path.join("/")}${request.nextUrl.search}`
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

  const responseHeaders = new Headers()
  for (const header of ["content-type", "cache-control", "location", "retry-after"]) {
    const value = upstream.headers.get(header)
    if (value) responseHeaders.set(header, value)
  }

  const setCookies = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  for (const cookie of setCookies) responseHeaders.append("set-cookie", cookie)

  if (setCookies.length === 0) {
    const cookie = upstream.headers.get("set-cookie")
    if (cookie) responseHeaders.set("set-cookie", cookie)
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeaders,
  })
}

export const GET = proxyAuth
export const POST = proxyAuth
export const PUT = proxyAuth
export const PATCH = proxyAuth
export const DELETE = proxyAuth
export const OPTIONS = proxyAuth
