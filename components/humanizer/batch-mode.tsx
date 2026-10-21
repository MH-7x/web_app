"use client"

import { Check, ChevronRight, FileText, Loader2, Square, Users, Wand2 } from "lucide-react"
import Link from "next/link"
import { Fragment, useEffect, useRef, useState } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { DiffPair, ScoreBadge, StrictnessToggle } from "@/components/humanizer/parts"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/empty-state"
import { TableSkeleton } from "@/components/skeletons"
import { Button, buttonVariants } from "@/components/ui/button"
import { Label, Select } from "@/components/ui/input"
import type { ContentType } from "@/lib/content-types"
import type { BatchItem } from "@/lib/humanizer-store"
import type { Strictness, UnitOutcome } from "@/lib/humanizer-types"
import { cn } from "@/lib/utils"

const TYPE_OPTIONS: { value: ContentType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "gbp", label: "GBP descriptions" },
  { value: "faq", label: "FAQ items" },
  { value: "blog", label: "Blog posts" },
  { value: "meta", label: "Meta descriptions" },
]
const TYPE_SHORT: Record<string, string> = { gbp: "GBP", faq: "FAQ", blog: "Blog", meta: "Meta" }

const idOf = (i: { rowId: string; key: string }) => `${i.rowId}:${i.key}`

type Loaded = { key: string; items: BatchItem[]; error?: string }

export function BatchMode({ client, strictness, onStrictness }: { client: { id: string; name: string } | null; strictness: Strictness; onStrictness: (s: Strictness) => void }) {
  const [type, setType] = useState<ContentType | "all">("all")
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [outcomes, setOutcomes] = useState<Record<string, UnitOutcome>>({})
  const [approved, setApproved] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const stop = useRef(false)

  const listKey = client ? `${client.id}:${type}` : ""
  const loading = Boolean(client) && loaded?.key !== listKey

  useEffect(() => {
    if (!client) return
    let live = true
    fetch(`/api/humanizer/items?clientId=${encodeURIComponent(client.id)}&type=${type}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { items?: BatchItem[]; error?: string } | null
        if (!res.ok || !body?.items) throw new Error(body?.error ?? `Request failed (${res.status}).`)
        return body.items
      })
      .then((items) => live && setLoaded({ key: `${client.id}:${type}`, items }))
      .catch((e) => live && setLoaded({ key: `${client.id}:${type}`, items: [], error: e instanceof Error ? e.message : "Could not load content." }))
    return () => {
      live = false
    }
  }, [client, type])

  // a different list means different results
  const [seenKey, setSeenKey] = useState(listKey)
  if (seenKey !== listKey) {
    setSeenKey(listKey)
    setOutcomes({})
    setApproved(new Set())
    setOpen(null)
    setError(null)
  }

  const items = loaded?.key === listKey ? loaded.items : []
  const isApproved = (i: BatchItem) => i.approved || approved.has(idOf(i))
  const processed = items.filter((i) => outcomes[idOf(i)])
  const pendingApproval = processed.filter((i) => !isApproved(i))
  const todoRows = [...new Set(items.filter((i) => !i.approved && !outcomes[idOf(i)]).map((i) => i.rowId))]

  async function approve(list: BatchItem[]) {
    const byRow = new Map<string, BatchItem[]>()
    for (const i of list) byRow.set(i.rowId, [...(byRow.get(i.rowId) ?? []), i])
    setError(null)
    for (const [rowId, group] of byRow) {
      const ids = group.map(idOf)
      setBusy((b) => new Set([...b, ...ids]))
      try {
        const res = await fetch("/api/humanizer/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: rowId, units: group.map((i) => ({ key: i.key, text: outcomes[idOf(i)].after, afterScore: outcomes[idOf(i)].afterScore })) }),
        })
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`)
        setApproved((a) => new Set([...a, ...ids]))
        toast.success(`${ids.length} ${ids.length === 1 ? "item" : "items"} approved`, { description: "The original is replaced in the content history." })
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not approve."
        setError(message)
        toast.error("Couldn't approve", { description: message })
        break
      } finally {
        setBusy((b) => new Set([...b].filter((x) => !ids.includes(x))))
      }
    }
  }

  async function process() {
    stop.current = false
    setRunning(true)
    setError(null)
    try {
      for (const rowId of todoRows) {
        if (stop.current) break
        const res = await fetch("/api/humanizer/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: rowId, strictness }),
        })
        const body = (await res.json().catch(() => null)) as { units?: UnitOutcome[]; error?: string } | null
        if (!res.ok || !body?.units) throw new Error(body?.error ?? `Request failed (${res.status}).`)
        const units = body.units
        setOutcomes((o) => ({ ...o, ...Object.fromEntries(units.map((u) => [`${rowId}:${u.key}`, u])) }))
      }
      if (!stop.current) toast.success("Batch processed", { description: "Review the scores, then approve." })
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong."
      setError(`${message} Press Process Batch to continue with the rest.`)
      toast.error("Batch stopped", { description: message })
    } finally {
      setRunning(false)
    }
  }

  if (!client) {
    return <EmptyState icon={Users} title="Select a client" description="Batch mode humanizes a client's saved content in bulk. Pick a client from the selector in the top bar." />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className="space-y-1.5">
          <Label className="block">Client</Label>
          <div className="flex h-9 min-w-56 items-center rounded-lg bg-muted px-3 text-sm">{client.name}</div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="batch-type" className="block">Content type</Label>
          <Select id="batch-type" value={type} onChange={(e) => setType(e.target.value as ContentType | "all")} disabled={running} className="w-48">
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="block">Strictness</Label>
          <StrictnessToggle value={strictness} onChange={onStrictness} disabled={running} />
        </div>
        {running ? (
          <Button size="lg" variant="outline" onClick={() => (stop.current = true)} className="h-10 px-4">
            <Square /> Stop after this item
          </Button>
        ) : (
          <Button size="lg" onClick={process} disabled={loading || todoRows.length === 0} className="h-10 px-4">
            <Wand2 /> {processed.length ? "Process Remaining" : "Process Batch"}
          </Button>
        )}
      </div>

      {(error || loaded?.error) && <ErrorNote message={(error ?? loaded?.error) as string} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading
            ? "Loading content…"
            : running
              ? `Processing… ${processed.length} of ${items.filter((i) => !i.approved).length} done`
              : processed.length
                ? `${processed.length} ${processed.length === 1 ? "item" : "items"} processed`
                : `${items.length} ${items.length === 1 ? "item" : "items"} found`}
        </p>
        <Button onClick={() => approve(pendingApproval)} disabled={running || pendingApproval.length === 0 || busy.size > 0}>
          <Check /> Approve All{pendingApproval.length ? ` (${pendingApproval.length})` : ""}
        </Button>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : items.length === 0 ? (
        <EmptyState icon={FileText} title="Nothing to humanize yet" description={`${client.name} has no saved ${type === "all" ? "content" : TYPE_OPTIONS.find((o) => o.value === type)?.label.toLowerCase()} from the Content module yet. Generate some, then come back to polish it in bulk.`}>
          <Link href="/content" className={buttonVariants()}>
            Go to Content
          </Link>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">Content</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Before</th>
                <th className="px-4 py-3">After</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const id = idOf(i)
                const out = outcomes[id]
                const done = isApproved(i)
                const expanded = open === id
                return (
                  <Fragment key={id}>
                    <tr className="border-b border-border last:border-0">
                      <td className="max-w-0 px-4 py-3">
                        <button type="button" disabled={!out} onClick={() => setOpen(expanded ? null : id)} aria-expanded={expanded} className="flex w-full items-center gap-2 text-left disabled:cursor-default">
                          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90", !out && "opacity-30")} />
                          <span dir="auto" className="truncate">
                            {i.label}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="muted">{TYPE_SHORT[i.type] ?? i.type}</Badge>
                      </td>
                      <td className="px-4 py-3">{out ? <ScoreBadge score={out.beforeScore} /> : <span className="text-muted-foreground">-</span>}</td>
                      <td className="px-4 py-3">{out ? <ScoreBadge score={out.afterScore} /> : <span className="text-muted-foreground">-</span>}</td>
                      <td className="px-4 py-3 text-right">
                        {done ? (
                          <Badge variant="success">{i.approved && !approved.has(id) ? "Humanized" : "Approved"}</Badge>
                        ) : out ? (
                          <Button size="sm" onClick={() => approve([i])} disabled={busy.has(id) || running}>
                            {busy.has(id) ? <Loader2 className="animate-spin" /> : <Check />} Approve
                          </Button>
                        ) : running && i === items.find((x) => !x.approved && !outcomes[idOf(x)]) ? (
                          <Loader2 className="ml-auto size-4 animate-spin text-primary" />
                        ) : (
                          <span className="text-muted-foreground">Waiting</span>
                        )}
                      </td>
                    </tr>
                    {expanded && out && (
                      <tr className="border-b border-border bg-muted/30 last:border-0">
                        <td colSpan={5} className="space-y-3 p-4">
                          <DiffPair before={out.before} after={out.after} beforeScore={out.beforeScore} afterScore={out.afterScore} />
                          {out.warnings.length > 0 && <p className="text-sm text-amber-800 dark:text-amber-300">Check before approving: {out.warnings.join(" ")}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Approving replaces the original in the client&apos;s Content History. Open a row to compare before approving. Only prose is rewritten: titles, FAQ questions and page names stay as they are.</p>
    </div>
  )
}
