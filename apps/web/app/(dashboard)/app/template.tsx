import type { ReactNode } from "react"

export default function DashboardPageTemplate({ children }: { children: ReactNode }) {
  return <div className="dashboard-page-transition">{children}</div>
}
