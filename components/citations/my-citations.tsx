"use client"

import { ListChecks, Loader2, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ActionPlan, type PlanScope } from "@/components/citations/action-plan"
import { BacklinksTable } from "@/components/citations/backlinks-table"
import { CompetitorsPanel } from "@/components/citations/competitors-panel"
import { NapTable } from "@/components/citations/nap-table"
import { StatusDialog } from "@/components/citations/status-dialog"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { isBacklink, isNapCitation, type CitationClient, type CitationDTO, type CompetitorDTO } from "@/lib/citations-types"
import { cn } from "@/lib/utils"

/** which kind of source the tab shows */
type Kind = "nap" | "backlink" | "all"

const KINDS: { id: Kind; label: string }[] = [
  { id: "nap", label: "NAP Citations" },
  { id: "backlink", label: "Backlinks" },
  { id: "all", label: "All" },
]
const PLAN_SCOPE: Record<Kind, PlanScope> = { nap: "nap", backlink: "backlinks", all: "all" }

export function MyCitations({
  client,
  citations,
  onCitationsChange,
  competitors,
  onCompetitorsChange,
  untracked,
  onTrackingChanged,
}: {
  client: CitationClient
  citations: CitationDTO[]
  onCitationsChange: (next: CitationDTO[]) => void
  competitors: CompetitorDTO[]
  onCompetitorsChange: (next: CompetitorDTO[]) => void
  untracked: number
  onTrackingChanged: () => void
}) {
  const [kind, setKind] = useState<Kind>("nap")
  const [editing, setEditing] = useState<CitationDTO | null>(null)
  const [initializing, setInitializing] = useState(false)

  async function initialize() {
    setInitializing(true)
    try {
      const res = await fetch(`/api/clients/${client.id}/citations`, { method: "POST" })
      const body = (await res.json().catch(() => null)) as { added?: number; citations?: CitationDTO[]; error?: string } | null
      if (!res.ok || !body?.citations) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      onCitationsChange(body.citations)
      onTrackingChanged()
      toast.success(body.added ? `${body.added} ${body.added === 1 ? "directory" : "directories"} added to tracking` : "Already tracking every relevant directory")
    } catch (e) {
      toast.error("Couldn't start tracking", { description: e instanceof Error ? e.message : "Please try again." })
    } finally {
      setInitializing(false)
    }
  }

  if (citations.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Citation tracking hasn't started for this client"
        description={`This adds every directory and backlink source that suits a ${client.category.replace("_", " ")} business, ready to check one by one. You can add more in Citation Sources.`}
      >
        <Button size="lg" onClick={initialize} disabled={initializing}>
          {initializing ? <Loader2 className="animate-spin" /> : <Plus />} Initialize Citation Tracking
        </Button>
      </EmptyState>
    )
  }

  const replace = (next: CitationDTO) => onCitationsChange(citations.map((c) => (c.id === next.id ? next : c)))
  const napCitations = citations.filter(isNapCitation)
  const backlinks = citations.filter(isBacklink)
  const kindCount: Record<Kind, number> = { nap: napCitations.length, backlink: backlinks.length, all: citations.length }
  const showNap = kind !== "backlink"
  const showBacklinks = kind !== "nap"

  return (
    <div className="space-y-5">
      {untracked > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 text-sm ring-1 ring-primary/20">
          <p className="flex-1">
            <span className="font-medium">{untracked} {untracked === 1 ? "source" : "sources"}</span> in the master list {untracked === 1 ? "isn't" : "aren't"} being tracked for this client yet.
          </p>
          <Button size="lg" onClick={initialize} disabled={initializing}>
            {initializing ? <Loader2 className="animate-spin" /> : <Plus />} Add to tracking
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show citations of type">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={kind === k.id}
            onClick={() => setKind(k.id)}
            className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm ring-1 transition-colors", kind === k.id ? "bg-primary text-primary-foreground ring-primary" : "bg-background ring-foreground/10 hover:bg-muted")}
          >
            {k.label}
            <span className={cn("text-xs tabular-nums", kind === k.id ? "text-primary-foreground/80" : "text-muted-foreground")}>{kindCount[k.id]}</span>
          </button>
        ))}
      </div>

      <ActionPlan clientId={client.id} citations={citations} scope={PLAN_SCOPE[kind]} onToggle={(id, done) => onCitationsChange(citations.map((c) => (c.id === id ? { ...c, actionDone: done } : c)))} />

      {showNap && (
        <section aria-label="NAP citations" className="space-y-3">
          {kind === "all" && <h2 className="text-sm font-semibold">NAP Citations</h2>}
          {napCitations.length === 0 ? <p className="rounded-xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">No directories are being tracked for this client.</p> : <NapTable client={client} citations={napCitations} onEdit={setEditing} />}
          <CompetitorsPanel clientId={client.id} clientName={client.name} citations={napCitations} competitors={competitors} onChange={onCompetitorsChange} />
        </section>
      )}

      {showBacklinks && (
        <section aria-label="Backlinks" className="space-y-3">
          {kind === "all" && <h2 className="text-sm font-semibold">Backlinks</h2>}
          {backlinks.length === 0 ? (
            <p className="rounded-xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">No backlink sources are being tracked for this client. Use Add to tracking above to include them.</p>
          ) : (
            <BacklinksTable clientId={client.id} citations={backlinks} onReplace={replace} />
          )}
        </section>
      )}

      <StatusDialog clientId={client.id} citation={editing} onClose={() => setEditing(null)} onSaved={replace} />
    </div>
  )
}
