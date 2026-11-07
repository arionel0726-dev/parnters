import { NotificationsPage } from "@/features/notifications/notifications-page"

export const dynamic = "force-dynamic"

export default function AdminNotificationsPage() {
  return <NotificationsPage fallbackHref="/app/notifications" />
}
