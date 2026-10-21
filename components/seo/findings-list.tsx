"use client"

import { AlertCircle, AlertTriangle, ChevronDown, Info, Lightbulb } from "lucide-react"
import { useState } from "react"

import { CATEGORIES } from "@/lib/audit/groups"
import type { Finding, Recommendation, Severity } from "@/lib/audit/types"
import { cn } from "@/lib/utils"

const SEVERITY: Record<Severity, { label: string; chip: string; icon: typeof Info; box: string }> = {
  critical: { label: "Critical", chip: "bg-destructive text-white", icon: AlertCircle, box: "bg-destructive/10 text-destructive" },
  warning: { label: "Warning", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300", icon: AlertTriangle, box: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  info: { label: "Info", chip: "bg-primary/10 text-primary", icon: Info, box: "bg-primary/10 text-primary" },
}

const FILTERS = ["all", "critical", "warning", "info"] as const

export function FindingsList({ findings, recommendations }: { findings: Finding[]; recommendations: Recommendation[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all")
  const count = (s: Severity) => findings.filter((f) => f.severity === s).length
  const shown = filter === "all" ? findings : findings.filter((f) => f.severity === filter)
  const fixes = new Map(recommendations.map((r) => [r.findingId, r.text]))

  return (
    <section aria-label="Findings" className="space-y-3">
      <div role="group" aria-label="Filter by severity" className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const n = f === "all" ? findings.length : count(f)
          return (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn("h-8 rounded-lg px-3 text-sm font-medium transition-colors", filter === f ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground hover:bg-muted")}
            >
              {f === "all" ? "All issues" : SEVERITY[f].label} ({n})
            </button>
          )
        })}
        <span className="ml-auto text-xs text-muted-foreground">Sorted by impact</span>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl bg-card px-6 py-12 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
          {findings.length === 0 ? "No issues found. Nice work." : "No issues at this severity."}
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((f) => {
            const s = SEVERITY[f.severity]
            const Icon = s.icon
            return (
              <li key={f.id}>
                <details className="group rounded-xl bg-card ring-1 ring-foreground/10 open:ring-foreground/20">
                  <summary className="flex cursor-pointer list-none items-start gap-4 p-4 marker:hidden [&::-webkit-details-marker]:hidden">
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", s.box)}>
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", s.chip)}>{s.label}</span>
                        <span className="text-xs text-muted-foreground">{CATEGORIES.find((c) => c.id === f.category)?.label}</span>
                      </div>
                      <p className="font-medium">{f.title}</p>
                      {f.targets.length > 0 && (
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          Target:
                          {f.targets.slice(0, 2).map((t) => (
                            <code key={t} className="max-w-72 truncate rounded bg-muted px-1.5 py-0.5 font-mono">
                              {t}
                            </code>
                          ))}
                          {f.targets.length > 2 && <span>+{f.targets.length - 2} more</span>}
                        </p>
                      )}
                    </div>
                    <ChevronDown className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>

                  <div className="space-y-4 border-t border-border px-4 py-4 ps-[4.5rem]">
                    <p className="text-sm text-muted-foreground">{f.detail}</p>
                    {fixes.get(f.id) && (
                      <p className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-sm">
                        <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>
                          <span className="font-medium">How to fix: </span>
                          {fixes.get(f.id)}
                        </span>
                      </p>
                    )}
                    {f.targets.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">
                          Affected ({f.count}
                          {f.count > f.targets.length ? `, first ${f.targets.length} shown` : ""})
                        </p>
                        <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-xs">
                          {f.targets.map((t) => (
                            <li key={t} className="truncate rounded bg-muted px-2 py-1" title={t}>
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
