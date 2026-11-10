const ACCOUNT_LINK_TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function safeAuthReturnTo(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null

  try {
    const parsed = new URL(value, "http://local.invalid")
    if (parsed.origin !== "http://local.invalid" || parsed.pathname !== "/link/legacy/authorize") return null

    const ticket = parsed.searchParams.get("ticket")
    if (!ticket || !ACCOUNT_LINK_TICKET_PATTERN.test(ticket) || parsed.searchParams.size !== 1) return null

    return `${parsed.pathname}?ticket=${encodeURIComponent(ticket)}`
  } catch {
    return null
  }
}
