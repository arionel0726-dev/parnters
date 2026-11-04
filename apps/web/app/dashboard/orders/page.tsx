import { CreatorEmptyPage } from "@/components/creator-dashboard/dashboard-ui"

export default function CreatorOrdersPage() {
  return <CreatorEmptyPage title="Заказы" description="Здесь будут отображаться подтверждённые заказы, связанные с вашими рекомендациями." note="Учёт заказов и переходы по referral-ссылкам ещё не подключены. Сейчас система не собирает клики и не связывает покупки с креаторами." actionHref="/dashboard/links" actionLabel="Перейти к ссылкам" />
}
