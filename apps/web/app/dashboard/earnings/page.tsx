import { CreatorEmptyPage } from "@/components/creator-dashboard/dashboard-ui"

export default function CreatorEarningsPage() {
  return <CreatorEmptyPage title="Вознаграждения" description="Информация о начислениях будет доступна, когда появятся подтверждённые данные заказов." note="Учёт заказов и начисление комиссии пока не подключены. Комиссионное соглашение можно посмотреть в разделе настроек; фактические суммы здесь не рассчитываются." actionHref="/dashboard/settings" actionLabel="Открыть настройки" />
}
