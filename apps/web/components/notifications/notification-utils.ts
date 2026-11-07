export type NotificationItem = {
  id: string
  type: string
  title: string
  message: string
  metadata: { href?: string; entityId?: string; locale?: "ru" | "ro"; status?: "active" | "suspended" | "banned" }
  readAt: string | null
  createdAt: string
}

export function safeNotificationHref(value: string | undefined, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback
  return value
}

export function formatNotificationDate(value: string, locale: "ru" | "ro") {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}
