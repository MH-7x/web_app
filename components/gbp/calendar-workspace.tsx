"use client"

import { CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Clock, Download, Loader2, Sparkles } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { EmptyState } from "@/components/empty-state"
import { GenerateWizard, type WizardClient } from "@/components/gbp/generate-wizard"
import { PostDetail, STATUS_STYLE } from "@/components/gbp/post-detail"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { GbpJobSnapshot } from "@/lib/gbp-jobs"
import { POST_TYPES, addDays, categoryLabel, longDayLabel, monthGrid, monthLabel, scheduleLabel, shiftMonth, type PostDTO } from "@/lib/gbp-posts-types"
import { cn } from "@/lib/utils"

export type GbpClient = { id: string; name: string; emirate: string; phone: string; primaryColor: string | null; gbpLocation: string | null }

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

export function CalendarWorkspace({
  client,
  month,
  today,
  posts,
  wizardClients,
  activeJob,
}: {
  client: GbpClient
  month: string
  today: string
  posts: PostDTO[]
  wizardClients: WizardClient[]
  activeJob: GbpJobSnapshot | null
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(posts[0]?.id ?? null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const byDate = new Map(posts.map((p) => [p.date, p]))
  const selected = posts.find((p) => p.id === selectedId) ?? null
  const drafts = posts.filter((p) => p.status === "draft")
  const pickedDrafts = drafts.filter((p) => picked.has(p.id))
  const allPicked = drafts.length > 0 && pickedDrafts.length === drafts.length
  const approvedCount = posts.filter((p) => p.status === "approved").length
  const exportable = posts.filter((p) => p.status !== "draft").length
  // a published post's schedule is history, so only the ones still waiting count
  const scheduled = posts.filter((p) => p.scheduledFor && p.status !== "published")

  const cells = monthGrid(month)
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
  // a week needs at least one post; weeks already over are not flagged
  const emptyWeeks = weeks.filter((w) => w.some((c) => c.inMonth) && w[6].key >= today && !w.some((c) => byDate.has(c.key)))

  const isCurrentMonth = today.startsWith(month)
  const baseDate = isCurrentMonth ? today : `${month}-01`

  async function approve(ids: string[]) {
    setApproving(true)
    setError(null)
    try {
      const res = await fetch("/api/gbp-posts/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: client.id, ids }) })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      setPicked(new Set())
      router.refresh()
      toast.success(`${ids.length} ${ids.length === 1 ? "post" : "posts"} approved`)
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setError(message)
      toast.error("Couldn't approve", { description: message })
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end justify-between gap-4 p-6">
        <div className="space-y-1">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            GBP automation studio · <span className="text-primary">{client.name}</span>
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Google Business Profile Posts</h2>
          <p className="max-w-md text-sm text-muted-foreground">Local-intent updates and offers in Arabic and English, one a week.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg ring-1 ring-foreground/10">
            <Link href={`/gbp-posts?month=${shiftMonth(month, -1)}`} aria-label="Previous month" className={buttonVariants({ variant: "ghost", size: "icon-lg" })}>
              <ChevronLeft />
            </Link>
            <span className="flex min-w-36 items-center justify-center gap-2 px-2 text-sm font-medium">
              <CalendarDays className="size-4 text-muted-foreground" /> {monthLabel(month)}
            </span>
            <Link href={`/gbp-posts?month=${shiftMonth(month, 1)}`} aria-label="Next month" className={buttonVariants({ variant: "ghost", size: "icon-lg" })}>
              <ChevronRight />
            </Link>
          </div>
          {exportable > 0 ? (
            <a href={`/api/gbp-posts/export?clientId=${client.id}&month=${month}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Download /> Export Month (XLSX)
            </a>
          ) : (
            <Button variant="outline" size="lg" disabled title="Approve at least one post to export the month">
              <Download /> Export Month (XLSX)
            </Button>
          )}
          <GenerateWizard clients={wizardClients} activeClientId={client.id} baseDate={baseDate} activeJob={activeJob} />
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-muted/60 px-4 py-3 text-sm">
        <label className="flex cursor-pointer items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={allPicked}
            disabled={drafts.length === 0}
            onChange={() => setPicked(allPicked ? new Set() : new Set(drafts.map((p) => p.id)))}
          />
          Select all drafts
        </label>
        <span className="text-muted-foreground">
          <span className="font-medium text-amber-600 dark:text-amber-400">{drafts.length} {drafts.length === 1 ? "draft" : "drafts"}</span> need confirmation
        </span>
        <Button className="ml-auto" disabled={pickedDrafts.length === 0 || approving} onClick={() => approve(pickedDrafts.map((p) => p.id))}>
          {approving ? <Loader2 className="animate-spin" /> : <Check />} Approve {pickedDrafts.length === drafts.length && drafts.length > 0 ? `All (${drafts.length})` : `Selected (${pickedDrafts.length})`}
        </Button>
      </div>
      {error && <ErrorNote message={error} />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-semibold">
              <CalendarDays className="size-4 text-muted-foreground" /> {monthLabel(month)} schedule
            </h3>
            <ul className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {(["approved", "draft", "published"] as const).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", STATUS_STYLE[s].dot)} /> {STATUS_STYLE[s].label} ({posts.filter((p) => p.status === s).length})
                </li>
              ))}
              {client.gbpLocation !== null && (
                <li className="flex items-center gap-1.5">
                  <Clock className="size-3" /> Scheduled ({scheduled.length})
                </li>
              )}
              <li className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-destructive/60" /> Empty week ({emptyWeeks.length})
              </li>
            </ul>
          </div>

          <div role="grid" aria-label={`${monthLabel(month)} posts`} className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div role="row" className="mb-1 grid grid-cols-7 gap-1.5">
                {DOW.map((d) => (
                  <div key={d} role="columnheader" className="py-1.5 text-center text-xs font-medium text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {weeks.map((week) => {
                  const flagged = emptyWeeks.includes(week)
                  return (
                    <div key={week[0].key} role="row" className={cn("grid grid-cols-7 gap-1.5 rounded-lg", flagged && "bg-destructive/5 p-1 ring-1 ring-destructive/25")}>
                      {week.map(({ key, inMonth }) => {
                        const post = byDate.get(key)
                        const day = Number(key.slice(8))
                        const isToday = key === today
                        if (!post) {
                          return (
                            <div key={key} role="gridcell" className={cn("min-h-[5.5rem] rounded-lg p-2 text-xs", inMonth ? "text-muted-foreground" : "text-muted-foreground/40", isToday && "ring-1 ring-primary/50")}>
                              <span className={cn(isToday && "font-semibold text-primary")}>{day}</span>
                            </div>
                          )
                        }
                        const style = STATUS_STYLE[post.status] ?? STATUS_STYLE.draft
                        const isSelected = post.id === selectedId
                        const pickable = post.status === "draft"
                        const waiting = Boolean(post.scheduledFor) && post.status !== "published"
                        return (
                          <div key={key} role="gridcell" className="relative">
                            <button
                              type="button"
                              onClick={() => setSelectedId(post.id)}
                              aria-pressed={isSelected}
                              aria-label={`${longDayLabel(key)}: ${POST_TYPES[post.postType] ?? post.postType}, ${categoryLabel(post.category)}, ${style.label}${waiting ? `, scheduled for ${scheduleLabel(post.scheduledFor!)}` : ""}`}
                              className={cn(
                                "flex min-h-[5.5rem] w-full flex-col gap-1 rounded-lg bg-muted/50 p-2 text-start text-xs transition-colors hover:bg-muted",
                                !inMonth && "opacity-50",
                                isSelected && "bg-primary/10 ring-2 ring-primary",
                                isToday && !isSelected && "ring-1 ring-primary/50"
                              )}
                            >
                              <span className="flex items-center justify-between">
                                <span className={cn("font-medium", isToday && "text-primary")}>{day}</span>
                                <span className="flex items-center gap-1.5">
                                  {isToday && <span className="rounded bg-primary px-1 text-[9px] font-semibold text-primary-foreground">TODAY</span>}
                                  {/* room for the checkbox that sits over this corner */}
                                  {pickable && <span className="w-4" />}
                                  {waiting && <Clock aria-hidden className="size-3 text-amber-600 dark:text-amber-400" />}
                                  <span className={cn("size-2 rounded-full", style.dot)} />
                                </span>
                              </span>
                              <span className={cn("truncate rounded px-1.5 py-0.5 font-medium", post.postType === "offer" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary")}>{POST_TYPES[post.postType] ?? post.postType}</span>
                              <span className="truncate text-muted-foreground">{categoryLabel(post.category)}</span>
                              {waiting && <span className="truncate text-[10px] text-amber-700 dark:text-amber-300">Scheduled for {scheduleLabel(post.scheduledFor!)}</span>}
                            </button>
                            {pickable && (
                              <input
                                type="checkbox"
                                aria-label={`Select draft for ${longDayLabel(key)}`}
                                checked={picked.has(post.id)}
                                onChange={() =>
                                  setPicked((cur) => {
                                    const next = new Set(cur)
                                    if (next.has(post.id)) next.delete(post.id)
                                    else next.add(post.id)
                                    return next
                                  })
                                }
                                className="absolute top-1.5 right-6 size-3.5 accent-primary"
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="space-y-4 p-5">
            <h3 className="font-semibold">Listing health</h3>
            <ul className="space-y-3 text-sm">
              <HealthRow ok={emptyWeeks.length === 0} label="Weekly coverage" value={emptyWeeks.length === 0 ? "Every week has a post" : `${emptyWeeks.length} empty ${emptyWeeks.length === 1 ? "week" : "weeks"}`} />
              <HealthRow ok={drafts.length === 0} label="Pending approval" value={drafts.length === 0 ? "None" : `${drafts.length} ${drafts.length === 1 ? "post" : "posts"}`} />
              <HealthRow ok={approvedCount > 0} label="Approved this month" value={`${approvedCount} ${approvedCount === 1 ? "post" : "posts"}`} />
            </ul>
            {emptyWeeks.length > 0 && (
              <p className="rounded-lg bg-destructive/5 p-3 text-xs text-muted-foreground">
                Empty weeks (highlighted red): {emptyWeeks.map((w) => weekLabel(w[0].key)).join(", ")}. Use Generate Posts to fill them.
              </p>
            )}
          </Card>
          <Card className="space-y-2 p-5 text-sm">
            <h3 className="font-semibold">Publishing</h3>
            {client.gbpLocation !== null ? (
              <p className="text-muted-foreground">
                Connected to <span className="font-medium text-foreground">{client.gbpLocation || "Google Business Profile"}</span>. Open a post and press Publish Now. Scheduled posts are not sent automatically: publish them when their time comes.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Approved posts are exported as a spreadsheet to publish on Google Business Profile. To publish from here,{" "}
                <Link href={`/clients/${client.id}?tab=settings`} className="text-primary hover:underline">
                  connect Google Business Profile
                </Link>
                .
              </p>
            )}
          </Card>
        </div>
      </div>

      {selected ? (
        <PostDetail key={selected.id} post={selected} clientName={client.name} phone={client.phone} brandColor={client.primaryColor} gbpLocation={client.gbpLocation} onDeleted={() => setSelectedId(null)} />
      ) : (
        posts.length === 0 ? (
          <EmptyState icon={CalendarDays} title={`No posts in ${monthLabel(month)} yet`} description="Draft a few weeks of Google Business Profile posts in one go: three a week, in Arabic, English or both, covering your keywords.">
            <Button onClick={() => document.getElementById("gbp-generate-trigger")?.click()}>
              <Sparkles /> Generate posts
            </Button>
          </EmptyState>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">Select a post on the calendar to read, edit or approve it.</div>
        )
      )}
    </div>
  )
}

const weekLabel = (sunday: string) => `${Number(sunday.slice(8))}–${Number(addDays(sunday, 6).slice(8))} ${new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${sunday}T00:00:00Z`))}`

function HealthRow({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <li className="flex items-center gap-2.5">
      {ok ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> : <CircleDashed className="size-4 shrink-0 text-amber-500" />}
      <span className="flex-1">{label}</span>
      <Badge variant={ok ? "success" : "muted"}>{value}</Badge>
    </li>
  )
}

