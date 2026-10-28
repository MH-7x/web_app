"use client"

import { FileText, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { CitationsOverview } from "@/components/citations/overview"
import { MyCitations } from "@/components/citations/my-citations"
import { TONE_CLASS } from "@/components/citations/parts"
import { QuickCheckDialog } from "@/components/citations/quick-check-dialog"
import { ReportDialog } from "@/components/citations/report-dialog"
import { SourcesTab } from "@/components/citations/sources-tab"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { aggregateSummaries, computeBacklinks, computeScore, scoreTone, type CitationClient, type CitationDTO, type ClientNapSummary, type CompetitorDTO, type SourceDTO } from "@/lib/citations-types"
import { cn } from "@/lib/utils"

type Tab = "mine" | "sources"

/** State that follows what the server sent, but can be edited in place until the next server render replaces it. */
function useSynced<T>(value: T) {
  const [state, setState] = useState(value)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setState(value)
  }
  return [state, setState] as const
}

export function CitationsWorkspace({
  client,
  citations: initialCitations,
  sources,
  competitors: initialCompetitors,
  untracked,
  overview,
}: {
  client: CitationClient | null
  citations: CitationDTO[]
  sources: SourceDTO[]
  competitors: CompetitorDTO[]
  untracked: number
  /** every client's summary; only sent while no client is selected */
  overview: ClientNapSummary[]
}) {
  const router = useRouter()
  const id = useId()
  const [tab, setTab] = useState<Tab>("mine")
  const [citations, setCitations] = useSynced(initialCitations)
  const [competitors, setCompetitors] = useSynced(initialCompetitors)
  const [quickCheck, setQuickCheck] = useState(false)
  const [report, setReport] = useState(false)

  const nap = computeScore(citations)
  const backlinks = computeBacklinks(citations)
  const all = aggregateSummaries(overview)
  const score = client ? nap.score : all.score
  const tone = scoreTone(score)
  const tracking = citations.length > 0
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "mine", label: client ? "My Citations" : "All Clients", count: client ? citations.length : all.clientCount },
    { id: "sources", label: "Citation Sources", count: sources.length },
  ]

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-5 p-6">
        <div className="flex items-center gap-5">
          <div className="text-center" role="status" aria-label={score === null ? "No NAP score yet" : `NAP score ${score} percent`}>
            <p className={cn("text-5xl leading-none font-semibold tabular-nums", TONE_CLASS[tone])}>{score === null ? "-" : `${score}%`}</p>
            <p className="mt-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{client ? "NAP score" : "Average NAP"}</p>
          </div>
          {client && backlinks.total > 0 && (
            <div className="text-center" role="status" aria-label={`${backlinks.live} of ${backlinks.total} backlinks live`} title="Backlink sources with a link confirmed live">
              <p className="text-5xl leading-none font-semibold tabular-nums">
                {backlinks.live}
                <span className="text-2xl text-muted-foreground">/{backlinks.total}</span>
              </p>
              <p className="mt-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Backlinks created</p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Local citations · {client ? <span className="text-primary">{client.name}</span> : "all clients"}</p>
            <h2 className="text-xl font-semibold tracking-tight">Citation Management</h2>
            <p className="max-w-lg text-sm text-muted-foreground">
              {!client
                ? all.trackedCount === 0
                  ? "No client is tracking citations yet. Open a client to start."
                  : all.score === null
                    ? `${plural(all.uncheckedCount, "directory", "directories")} to check across ${plural(all.trackingCount, "client", "clients")}. The score appears once a listing is recorded.`
                    : `${plural(all.issueCount, "listing has", "listings have")} wrong details across ${plural(all.trackingCount, "client", "clients")}. ${all.correctFields} of ${all.totalFields} details are correct. Pick a client in the top bar to work on one.`
                : !tracking
                  ? "Start tracking to see where this business is listed and whether its details are consistent."
                  : nap.score === null
                    ? `${nap.uncheckedCount} directories to check. The score appears once you record a listing.`
                    : `${nap.issues.length} ${nap.issues.length === 1 ? "issue" : "issues"} found across ${nap.listedCount} ${nap.listedCount === 1 ? "listing" : "listings"}. ${nap.correctFields} of ${nap.totalFields} details are correct.`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="lg" onClick={() => setQuickCheck(true)} disabled={!client || !tracking}>
            <Search /> Quick Check
          </Button>
          <Button size="lg" onClick={() => setReport(true)} disabled={!client || !tracking}>
            <FileText /> Export Report
          </Button>
        </div>
      </Card>

      <div role="tablist" aria-label="Citations" className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`${id}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`${id}-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            <span className="text-xs text-muted-foreground tabular-nums">{t.count}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${id}-panel-mine`} aria-labelledby={`${id}-tab-mine`} hidden={tab !== "mine"}>
        {client ? (
          <MyCitations
            client={client}
            citations={citations}
            onCitationsChange={setCitations}
            competitors={competitors}
            onCompetitorsChange={setCompetitors}
            untracked={untracked}
            onTrackingChanged={() => router.refresh()}
          />
        ) : (
          <CitationsOverview rows={overview} />
        )}
      </div>
      <div role="tabpanel" id={`${id}-panel-sources`} aria-labelledby={`${id}-tab-sources`} hidden={tab !== "sources"}>
        <SourcesTab sources={sources} onChange={() => router.refresh()} />
      </div>

      {client && <QuickCheckDialog clientId={client.id} clientName={client.name} open={quickCheck} onClose={() => setQuickCheck(false)} />}
      {client && <ReportDialog clientId={client.id} clientName={client.name} open={report} onClose={() => setReport(false)} />}
    </div>
  )
}
