import { CreatorEmptyPage } from "@/components/creator-dashboard/dashboard-ui"

export default function CreatorPayoutsPage() {
  return <CreatorEmptyPage title="Выплаты" description="История выплат появится после подключения реестра начислений и выплат." note="Пока нельзя просмотреть или запросить выплату: финансовый ledger не подключён." actionHref="/dashboard/earnings" actionLabel="К вознаграждениям" />
}
