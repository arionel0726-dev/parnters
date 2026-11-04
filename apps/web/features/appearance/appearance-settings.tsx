"use client"

import { Check, CircleDot, Laptop, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { accentOptions, useAccent } from "./appearance-provider"

const themeOptions = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Laptop },
] as const

export function AppearanceSettings({ drawer = false }: { drawer?: boolean }) {
  const { theme, setTheme } = useTheme()
  const { accent, setAccent, mounted } = useAccent()
  const selectedTheme = mounted ? theme ?? "system" : "system"

  return (
    <section className={cn("bg-white", drawer ? "min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6" : "px-5 py-8 sm:px-8 sm:py-10 lg:px-10")}>
      <div className={cn(drawer ? "w-full" : "mx-auto max-w-6xl")}>
        <div className="border-b border-border pb-7">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Settings</p>
          <h1 className="mt-3 text-5xl leading-none tracking-[-0.025em]">Appearance</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-smoke">
            Customize how Vizaje Partners looks in your browser. These settings stay on this device for now.
          </p>
        </div>

        <div className={cn("grid gap-10 py-8", drawer ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.92fr)] lg:gap-12")}>
          <div className="space-y-9">
            <div>
              <h2 className="text-sm font-medium">Theme</h2>
              <p className="mt-1 text-sm text-smoke">Choose how the interface appears.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {themeOptions.map(({ id, label, icon: Icon }) => {
                  const selected = selectedTheme === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTheme(id)}
                      className={cn(
                        "flex h-11 items-center justify-center gap-2 rounded-sm border px-3 text-sm transition-colors",
                        selected ? "border-charcoal bg-charcoal font-medium text-white" : "border-border bg-white hover:bg-[#f6f6f4]",
                      )}
                      aria-pressed={selected}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-medium">Accent color</h2>
              <p className="mt-1 text-sm text-smoke">Choose an accent for interactive elements. Status colors stay consistent.</p>
              <div className="mt-4 flex flex-wrap gap-3" role="radiogroup" aria-label="Accent color">
                {accentOptions.map((option) => {
                  const selected = accent === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={option.label}
                      title={option.label}
                      onClick={() => setAccent(option.id)}
                      className={cn(
                        "relative flex size-9 items-center justify-center rounded-none border border-transparent transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        selected && "border-foreground ring-2 ring-foreground ring-offset-2 ring-offset-background",
                      )}
                      style={{ backgroundColor: option.color }}
                    >
                      {selected ? <Check className="size-4" color={option.foreground} strokeWidth={2.5} aria-hidden="true" /> : null}
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 text-xs text-smoke">Current: {accentOptions.find((option) => option.id === accent)?.label}</p>
            </div>
          </div>

          <div className={cn("border-t border-border pt-8", !drawer && "lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0")}>
            <h2 className="text-sm font-medium">Preview</h2>
            <p className="mt-1 text-sm text-smoke">A quick look at key interface elements with your current settings.</p>

            <div className="mt-5 space-y-5 rounded-sm border border-border bg-white p-5">
              <div className="flex flex-wrap gap-2">
                <Button size="sm">Primary button</Button>
                <Button size="sm" variant="outline">Secondary button</Button>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-completed/10 px-2.5 py-1 font-medium text-status-completed">
                  <CircleDot className="size-3" aria-hidden="true" />
                  Active
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-pending/10 px-2.5 py-1 font-medium text-status-pending">
                  <CircleDot className="size-3" aria-hidden="true" />
                  Pending
                </span>
              </div>

              <Input placeholder="Enter text..." aria-label="Preview input" />

              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Agreement readiness</span>
                  <span>60%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-sand">
                  <div className="h-full w-3/5 rounded-full bg-moss transition-[width] duration-300 motion-reduce:transition-none" />
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-2 text-xs text-smoke sm:grid-cols-3">
              <div className="rounded-sm border border-border bg-white px-3 py-2">Thin borders</div>
              <div className="rounded-sm border border-border bg-white px-3 py-2">Compact controls</div>
              <div className="rounded-sm border border-border bg-white px-3 py-2">No shadows</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
