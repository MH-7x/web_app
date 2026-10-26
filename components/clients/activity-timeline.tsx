"use client"

import { Calendar, FileText, History, Search, Target, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { EmptyState } from "@/components/empty-state"
import { ACTIVITY_FILTERS, type ActivityItem, type ActivityType } from "@/lib/client-activity-types"
import { cn } from "@/lib/utils"

const ICONS: Record<ActivityType, LucideIcon> = { content: FileText, ads: Target, gbp: Calendar, audit: Search }

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: ActivityItem[] }

const dayKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

export function ActivityTimeline({ clientId }: { clientId: string }) {
  const [state, setState] = useState<State>({ status: "loading" })
  const [filter, setFilter] = useState<"all" | ActivityType>("all")

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/clients/${clientId}/activity`, { signal: controller.signal })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { items?: ActivityItem[]; error?: string }
        if (!res.ok || !data.items) throw new Error(data.error ?? "Couldn't load the activity.")
        setState({ status: "ready", items: data.items })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ status: "error", message: error instanceof Error ? error.message : "Couldn't load the activity." })
      })
    return () => controller.abort()
  }, [clientId])

  const items = useMemo(() => (state.status === "ready" ? state.items : []), [state])
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length }
    for (const item of items) c[item.type] = (c[item.type] ?? 0) + 1
    return c
  }, [items])

  const days = useMemo(() => {
    const groups: { key: string; label: string; items: ActivityItem[] }[] = []
    for (const item of items) {
      if (filter !== "all" && item.type !== filter) continue
      const key = dayKey(item.date)
      const last = groups[groups.length - 1]
      if (last?.key === key) last.items.push(item)
      else groups.push({ key, label: dayLabel(item.date), items: [item] })
    }
    return groups
  }, [items, filter])

  return (
    <div className="space-y-5 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <div role="group" aria-label="Filter activity" className="flex flex-wrap gap-1.5">
        {ACTIVITY_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-sm transition-colors",
              filter === f.value ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label}
            {state.status === "ready" && <span className="ml-1.5 text-xs tabular-nums opacity-70">{counts[f.value] ?? 0}</span>}
          </button>
        ))}
      </div>

      {state.status === "loading" ? (
        <ul aria-busy="true" aria-label="Loading activity" className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex gap-3">
              <span className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
              <span className="mt-1 h-4 w-2/3 animate-pulse rounded bg-muted" />
            </li>
          ))}
        </ul>
      ) : state.status === "error" ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.message}
        </p>
      ) : days.length === 0 ? (
        <EmptyState
          icon={History}
          title={items.length === 0 ? "No activity yet" : "Nothing matches this filter"}
          description={
            items.length === 0
              ? "Generated content, ads, GBP posts and SEO audits for this client will show up here."
              : "Pick another filter to see the rest of the activity."
          }
          className="border-0 bg-transparent py-12"
        />
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <section key={day.key} aria-label={day.label} className="grid gap-x-6 gap-y-2 sm:grid-cols-[8rem_1fr]">
              <h3 className="text-sm font-medium text-muted-foreground sm:pt-1.5">{day.label}</h3>
              <ol className="relative space-y-1 before:absolute before:top-4 before:bottom-4 before:left-4 before:w-px before:bg-border">
                {day.items.map((item) => {
                  const Icon = ICONS[item.type]
                  const body = (
                    <>
                      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-4 ring-card">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 pt-1">
                        <span className="block text-sm font-medium">{item.description}</span>
                        <span className="block text-xs text-muted-foreground">{timeLabel(item.date)}</span>
                      </span>
                    </>
                  )
                  return (
                    <li key={item.id}>
                      {item.linkTo ? (
                        <Link href={item.linkTo} className="flex gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-muted/60">
                          {body}
                        </Link>
                      ) : (
                        <div className="flex gap-3 px-1 py-1.5">{body}</div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
