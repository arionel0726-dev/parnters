import { Skeleton } from "@/components/ui/skeleton"
import type { ReactNode } from "react"

const skeletonClass = "bg-[#e8e8e6]"

function SkeletonStatus({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Загрузка…</span>
      {children}
    </div>
  )
}

export function CreatorDashboardSkeleton() {
  return (
    <SkeletonStatus>
      <div className="vp-overview-page">
        <header className="vp-page-header">
          <div className="space-y-3">
            <Skeleton className={`h-12 w-56 ${skeletonClass}`} />
            <Skeleton className={`h-5 w-[min(560px,80vw)] ${skeletonClass}`} />
          </div>
          <Skeleton className={`h-12 w-44 rounded-full ${skeletonClass}`} />
        </header>
        <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4 rounded-[24px] border border-border p-6 sm:p-8">
            <Skeleton className={`h-4 w-36 ${skeletonClass}`} />
            <Skeleton className={`h-14 w-48 ${skeletonClass}`} />
            <Skeleton className={`h-4 w-64 ${skeletonClass}`} />
          </div>
          <div className="flex flex-wrap items-end gap-3 rounded-[24px] border border-border p-6 sm:p-8">
            <Skeleton className={`h-11 w-40 rounded-full ${skeletonClass}`} />
            <Skeleton className={`h-11 w-40 rounded-full ${skeletonClass}`} />
          </div>
        </section>
        <section className="mt-4 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className={`h-32 rounded-[20px] ${skeletonClass}`} />)}
        </section>
        <section className={`mt-4 h-56 rounded-[20px] border border-border ${skeletonClass}`} />
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className={`h-64 rounded-[20px] ${skeletonClass}`} />)}
        </section>
      </div>
    </SkeletonStatus>
  )
}

export function CreatorLinksSkeleton() {
  return (
    <SkeletonStatus>
      <div className="grid w-full gap-3 rounded-[20px] border border-border p-4 sm:p-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="grid gap-3 border-b border-border pb-4 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1.5fr)_140px_120px_80px_80px_160px] sm:items-center">
            <div className="space-y-2"><Skeleton className={`h-4 w-44 ${skeletonClass}`} /><Skeleton className={`h-3 w-28 ${skeletonClass}`} /></div>
            <Skeleton className={`h-6 w-20 rounded-full ${skeletonClass}`} />
            <Skeleton className={`h-6 w-24 rounded-full ${skeletonClass}`} />
            <Skeleton className={`h-4 w-8 ${skeletonClass}`} />
            <Skeleton className={`h-4 w-8 ${skeletonClass}`} />
            <div className="flex gap-2"><Skeleton className={`size-8 ${skeletonClass}`} /><Skeleton className={`size-8 ${skeletonClass}`} /><Skeleton className={`size-8 ${skeletonClass}`} /></div>
          </div>
        ))}
      </div>
    </SkeletonStatus>
  )
}

export function CreatorFinanceSkeleton({ mode }: { mode: "orders" | "earnings" | "payouts" }) {
  return (
    <SkeletonStatus>
      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className={`h-32 rounded-[16px] ${skeletonClass}`} />)}
      </div>
      {mode === "payouts" ? <Skeleton className={`mt-7 h-40 rounded-[16px] ${skeletonClass}`} /> : null}
      {mode === "earnings" ? <div className="mt-7 grid gap-3 sm:grid-cols-2"><Skeleton className={`h-28 rounded-[16px] ${skeletonClass}`} /><Skeleton className={`h-28 rounded-[16px] ${skeletonClass}`} /></div> : null}
      <div className="mt-7 overflow-hidden rounded-[16px] border border-border">
        <div className={`h-11 ${skeletonClass}`} />
        <div className="space-y-4 p-4 sm:p-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="flex items-center gap-4"><Skeleton className={`h-4 w-24 ${skeletonClass}`} /><Skeleton className={`h-4 flex-1 ${skeletonClass}`} /><Skeleton className={`h-4 w-20 ${skeletonClass}`} /><Skeleton className={`h-4 w-24 ${skeletonClass}`} /></div>)}</div>
      </div>
    </SkeletonStatus>
  )
}

export function AdminOverviewSkeleton() {
  return (
    <SkeletonStatus>
      <section className="flex min-h-[calc(100vh-64px)] flex-col bg-white">
        <div className="flex flex-1 items-center justify-center px-5 py-20 sm:px-10">
          <div className="w-full max-w-xl rounded-sm border border-border bg-white px-6 py-16 sm:px-16">
            <Skeleton className={`mx-auto size-14 rounded-sm ${skeletonClass}`} />
            <Skeleton className={`mx-auto mt-6 h-12 w-40 ${skeletonClass}`} />
            <Skeleton className={`mx-auto mt-4 h-5 w-72 max-w-full ${skeletonClass}`} />
            <div className="mt-8 grid gap-3 sm:grid-cols-2">{Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className={`h-20 ${skeletonClass}`} />)}</div>
            <Skeleton className={`mx-auto mt-8 h-10 w-48 ${skeletonClass}`} />
          </div>
        </div>
      </section>
    </SkeletonStatus>
  )
}

export function TableSkeletonRows({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return <>{Array.from({ length: rows }, (_, index) => <tr key={index} aria-hidden="true"><td colSpan={columns} className="border-t border-border p-0"><div className="flex flex-wrap items-center gap-4 px-4 py-4"><Skeleton className={`h-4 w-28 ${skeletonClass}`} /><Skeleton className={`h-4 min-w-32 flex-1 ${skeletonClass}`} /><Skeleton className={`h-4 w-24 ${skeletonClass}`} /><Skeleton className={`h-4 w-20 ${skeletonClass}`} /><Skeleton className={`h-8 w-20 ${skeletonClass}`} /></div></td></tr>)}</>
}

export function PartnerProfileSkeleton() {
  return (
    <SkeletonStatus>
      <section className="min-h-[calc(100vh-64px)] bg-white px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1200px]">
          <Skeleton className={`h-4 w-32 ${skeletonClass}`} />
          <Skeleton className={`mt-5 h-12 w-72 max-w-full ${skeletonClass}`} />
          <Skeleton className={`mt-3 h-4 w-36 ${skeletonClass}`} />
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-6">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className={`h-44 rounded-[16px] ${skeletonClass}`} />)}</div>
            <div className="space-y-6">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className={`h-44 rounded-[16px] ${skeletonClass}`} />)}</div>
          </div>
        </div>
      </section>
    </SkeletonStatus>
  )
}

export function CreatorSettingsSkeleton() {
  return (
    <SkeletonStatus>
      <div className="mx-auto w-full max-w-[960px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
        <Skeleton className={`h-11 w-52 ${skeletonClass}`} />
        <Skeleton className={`mt-4 h-5 w-96 max-w-full ${skeletonClass}`} />
        <Skeleton className={`mt-7 h-[420px] rounded-[16px] ${skeletonClass}`} />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className={`h-24 rounded-[16px] ${skeletonClass}`} />)}</div>
        <Skeleton className={`mt-5 h-28 rounded-[16px] ${skeletonClass}`} />
      </div>
    </SkeletonStatus>
  )
}

export function InlineListSkeleton({ rows = 3 }: { rows?: number }) {
  return <div role="status" aria-busy="true" className="space-y-3">{Array.from({ length: rows }, (_, index) => <div key={index} className="space-y-2 border-b border-border pb-3 last:border-0 last:pb-0"><Skeleton className={`h-4 w-44 ${skeletonClass}`} /><Skeleton className={`h-3 w-72 max-w-full ${skeletonClass}`} /><Skeleton className={`h-3 w-36 ${skeletonClass}`} /></div>)}</div>
}

export function MetricGridSkeleton({ count = 6 }: { count?: number }) {
  return <div role="status" aria-busy="true" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">{Array.from({ length: count }, (_, index) => <Skeleton key={index} className={`h-20 ${skeletonClass}`} />)}</div>
}
