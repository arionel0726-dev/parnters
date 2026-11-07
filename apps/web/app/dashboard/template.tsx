import type { ReactNode } from "react"

export default function CreatorDashboardPageTemplate({ children }: { children: ReactNode }) {
  return <div className="dashboard-page-transition">{children}</div>
}
