"use client"

import { ArrowRight, UsersRound } from "lucide-react"
import { useSettingsDrawer } from "@/components/layout/settings-drawer-context"

export default function DashboardPage() {
  const openSettings = useSettingsDrawer()

  return (
    <section className="flex min-h-[calc(100vh-64px)] flex-col bg-white">
      <div className="flex flex-1 items-center justify-center px-5 py-20 sm:px-10">
        <div className="flex max-w-xl flex-col items-center rounded-sm border border-border bg-white px-6 py-16 text-center sm:px-16">
          <div className="mb-6 flex size-14 items-center justify-center rounded-sm border border-border bg-[#f6f6f4]">
            <UsersRound className="size-6 text-smoke" strokeWidth={1.7} aria-hidden="true" />
          </div>
          <h1 className="text-5xl leading-none tracking-[-0.025em]">Ready to build</h1>
          <p className="mt-4 text-lg text-smoke">No partner data yet</p>
          <p className="mt-3 max-w-md text-sm leading-6 text-smoke">
            Your workspace is ready. Once partners are added, they&apos;ll appear here for you to manage agreements and track activity.
          </p>
          <button
            type="button"
            onClick={openSettings}
            className="mt-8 inline-flex h-10 items-center gap-2 rounded-none bg-charcoal px-4 text-sm font-medium tracking-[0.05em] text-white transition-opacity hover:opacity-85"
          >
            Customize workspace
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="border-t border-border px-5 py-4 text-center text-xs text-smoke sm:px-10 sm:text-left">
        This foundation intentionally contains no production partner records or financial statistics.
      </div>
    </section>
  )
}
