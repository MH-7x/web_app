"use client"

import { ExternalLink, Link2, Loader2, Pencil, ShieldCheck, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BacklinkDialog } from "@/components/citations/backlink-dialog"
import { LinkStatusBadge } from "@/components/citations/parts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LINK_STATUSES, LINK_STATUS_LABEL, categoryLabel, type CitationDTO, type LinkStatus } from "@/lib/citations-types"
import { cn } from "@/lib/utils"

type Filter = "all" | "none" | LinkStatus
type CheckResponse = { citation?: CitationDTO; result?: { state: "live" | "dead" | "unknown"; message: string }; error?: string }

const FILTERS: Filter[] = ["all", "none", ...LINK_STATUSES]

const createdOn = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" }) : "-")

/** Backlink sources for one client: just the link, whether it is live, and when it was created. No name/address/phone checks. */
export function BacklinksTable({ clientId, citations, onReplace }: { clientId: string; citations: CitationDTO[]; onReplace: (next: CitationDTO) => void }) {
  const [filter, setFilter] = useState<Filter>("all")
  const [editing, setEditing] = useState<CitationDTO | null>(null)
  /** ids with a request in flight, so each row's buttons can show progress */
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())

  const rows = [...citations].sort((a, b) => b.source.domainAuthority - a.source.domainAuthority || a.source.name.localeCompare(b.source.name))
  const statusOf = (c: CitationDTO): Filter => c.linkStatus || "none"
  const shown = filter === "all" ? rows : rows.filter((c) => statusOf(c) === filter)

  const track = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  async function save(c: CitationDTO, fields: { linkUrl?: string; linkStatus?: LinkStatus | "" }, done?: string) {
    track(c.id, true)
    try {
      const res = await fetch(`/api/clients/${clientId}/citations`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ citationId: c.id, ...fields }) })
      const body = (await res.json().catch(() => null)) as { citation?: CitationDTO; error?: string } | null
      if (!res.ok || !body?.citation) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      onReplace(body.citation)
      if (done) toast.success(done)
    } catch (e) {
      toast.error(`Couldn't save ${c.source.name}`, { description: e instanceof Error ? e.message : "Please try again." })
    } finally {
      track(c.id, false)
    }
  }

  async function checkLink(c: CitationDTO) {
    track(c.id, true)
    try {
      const res = await fetch(`/api/clients/${clientId}/citations/check-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ citationId: c.id }) })
      const body = (await res.json().catch(() => null)) as CheckResponse | null
      if (!res.ok || !body?.citation || !body.result) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      onReplace(body.citation)
      const { state, message } = body.result
      if (state === "live") toast.success(`${c.source.name}: link is live`, { description: message })
      else if (state === "dead") toast.error(`${c.source.name}: link is dead`, { description: message })
      else toast.warning(`${c.source.name}: couldn't check`, { description: message })
    } catch (e) {
      toast.error("Couldn't check the link", { description: e instanceof Error ? e.message : "Please try again." })
    } finally {
      track(c.id, false)
    }
  }

  function remove(c: CitationDTO) {
    if (!window.confirm(`Clear the ${c.source.name} link? The URL and status are removed and the source goes back to "Not created".`)) return
    void save(c, { linkUrl: "", linkStatus: "" }, `${c.source.name} link cleared`)
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3" role="group" aria-label="Filter backlinks by status">
        {FILTERS.map((f) => {
          const count = f === "all" ? rows.length : rows.filter((c) => statusOf(c) === f).length
          return (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm ring-1 transition-colors", filter === f ? "bg-primary text-primary-foreground ring-primary" : "bg-background ring-foreground/10 hover:bg-muted")}
            >
              {f === "all" ? "All" : LINK_STATUS_LABEL[f]}
              <span className={cn("text-xs tabular-nums", filter === f ? "text-primary-foreground/80" : "text-muted-foreground")}>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-5 py-2.5 font-medium">Source</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium" title="Domain authority">DA</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Category</th>
              <th scope="col" className="min-w-64 px-3 py-2.5 font-medium">Link URL</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Link status</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Created</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                  No backlinks with this status.
                </td>
              </tr>
            ) : (
              shown.map((c) => {
                const working = busy.has(c.id)
                const hasLink = Boolean(c.linkUrl || c.linkStatus)
                return (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-5 py-2.5">
                      <a href={c.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-primary hover:underline">
                        {c.source.name} <ExternalLink className="size-3 text-muted-foreground" />
                      </a>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.source.domainAuthority || <span className="text-muted-foreground">-</span>}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="muted">{categoryLabel(c.source.category)}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <LinkUrlInput key={`${c.id}:${c.linkUrl}`} citation={c} disabled={working} onCommit={(linkUrl) => save(c, { linkUrl })} />
                    </td>
                    <td className="px-3 py-2.5">
                      <LinkStatusBadge status={c.linkStatus} />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">{createdOn(c.linkCreatedAt)}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        <Button type="button" variant="outline" size="sm" onClick={() => checkLink(c)} disabled={working || !c.linkUrl} title={c.linkUrl ? "Load the page and confirm it is still there" : "Add the link URL first"}>
                          {working ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Check link
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${c.source.name} link`} onClick={() => setEditing(c)} disabled={working}>
                          <Pencil />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Clear ${c.source.name} link`} onClick={() => remove(c)} disabled={working || !hasLink}>
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <BacklinkDialog clientId={clientId} citation={editing} onClose={() => setEditing(null)} onSaved={onReplace} />
    </Card>
  )
}

/** The link URL, editable in place: saved when you leave the field or press Enter, and only if it changed. */
function LinkUrlInput({ citation, disabled, onCommit }: { citation: CitationDTO; disabled: boolean; onCommit: (url: string) => void }) {
  const [value, setValue] = useState(citation.linkUrl)

  function commit() {
    const next = value.trim()
    if (next !== citation.linkUrl) onCommit(next)
  }

  return (
    <div className="flex items-center gap-1.5">
      <Link2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <Input
        type="url"
        inputMode="url"
        aria-label={`Link URL on ${citation.source.name}`}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="Paste the link once created"
        className="h-8"
      />
      {citation.linkUrl && (
        <a href={citation.linkUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open the ${citation.source.name} link`} className="shrink-0 text-muted-foreground hover:text-primary">
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  )
}
