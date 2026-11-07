import { NotificationsPage } from "@/features/notifications/notifications-page"

export const dynamic = "force-dynamic"

export default function CreatorNotificationsPage() {
  return <NotificationsPage fallbackHref="/dashboard/notifications" />
}
