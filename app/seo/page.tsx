import { Search, Users } from "lucide-react"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"

import { EmptyState } from "@/components/empty-state"
import { StartAuditButton } from "@/components/seo/start-audit-button"
import { AuditSkeleton } from "@/components/skeletons"
import { AuditRunner } from "@/components/seo/audit-runner"
import { FindingsList } from "@/components/seo/findings-list"
import { ReportView } from "@/components/seo/report-view"
import { ScoreRing, scoreTone } from "@/components/seo/score-ring"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, Eyebrow } from "@/components/ui/card"
import { getActiveJob } from "@/lib/audit/jobs"
import { CATEGORIES } from "@/lib/audit/groups"
import type { AuditPayloadV2, AuditScores, AuditScoresV2, CategoryId, Finding, Recommendation, RecommendationV2 } from "@/lib/audit/types"
import { getClient } from "@/lib/clients"
import { ACTIVE_CLIENT_COOKIE } from "@/lib/constants"
import { db } from "@/lib/db"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "SEO Audit" }

const TZ = "Asia/Dubai"
const stamp = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(d)
const stampLong = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d)

export default function SeoPage(props: PageProps<"/seo">) {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">SEO Audit</h1>
      <Suspense fallback={<AuditSkeleton />}>
        <ActiveClientAudit searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}

/** Audits come in two shapes: the older four-category audit and the current ten-group audit. */
type AuditRow = { id: string; createdAt: Date; overall: number; high: number; other: number } & (
  | { kind: "v2"; scores: AuditScoresV2; payload: AuditPayloadV2; recommendations: RecommendationV2[] }
  | { kind: "v1"; scores: AuditScores; findings: Finding[]; recommendations: Recommendation[] }
)

/** Stored JSON back to typed values; rows of an unknown shape are skipped rather than crashing the page. */
function hydrate(row: { id: string; createdAt: Date; scores: unknown; findings: unknown; recommendations: unknown }): AuditRow | null {
  const s = row.scores as { version?: number; overall?: number } | null
  if (!s || typeof s.overall !== "number") return null

  if (s.version === 2 && row.findings && !Array.isArray(row.findings)) {
    const payload = row.findings as AuditPayloadV2
    const recommendations = (Array.isArray(row.recommendations) ? row.recommendations : []) as RecommendationV2[]
    return {
      kind: "v2",
      id: row.id,
      createdAt: row.createdAt,
      overall: s.overall,
      high: recommendations.filter((r) => r.priority === "high").length,
      other: recommendations.filter((r) => r.priority !== "high").length,
      scores: row.scores as AuditScoresV2,
      payload,
      recommendations,
    }
  }

  const scores = row.scores as AuditScores
  if (!scores.onPage || !Array.isArray(row.findings)) return null
  const findings = row.findings as Finding[]
  return {
    kind: "v1",
    id: row.id,
    createdAt: row.createdAt,
    overall: scores.overall,
    high: findings.filter((f) => f.severity === "critical").length,
    other: findings.filter((f) => f.severity !== "critical").length,
    scores,
    findings,
    recommendations: (row.recommendations as Recommendation[]) ?? [],
  }
}

async function ActiveClientAudit({ searchParams }: { searchParams: PageProps<"/seo">["searchParams"] }) {
  await connection()
  const [sp, jar] = await Promise.all([searchParams, cookies()])
  const id = jar.get(ACTIVE_CLIENT_COOKIE)?.value
  const client = id ? await getClient(id) : null

  if (!client) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-20 text-center ring-1 ring-foreground/10">
        <Users className="size-8 text-muted-foreground/60" />
        <p className="font-medium">Select a client to audit their website</p>
        <p className="max-w-md text-sm text-muted-foreground">Pick a client from the selector in the top bar. The audit crawls the website saved on their profile.</p>
        <Link href="/clients/new" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Add a client
        </Link>
      </div>
    )
  }

  const rows = (await db.audit.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" }, take: 10 })).map(hydrate).filter((r): r is AuditRow => r !== null)
  const asked = Array.isArray(sp.audit) ? sp.audit[0] : sp.audit
  const selected = rows.find((r) => r.id === asked) ?? rows[0] ?? null
  const now = new Date()

  return (
    <div className="space-y-6">
      <p className="-mt-3 text-sm text-muted-foreground">{client.name}</p>

      <AuditRunner
        key={client.id}
        clientId={client.id}
        website={client.website}
        lastCrawled={rows[0] ? `${timeAgo(rows[0].createdAt, now)} (${stampLong(rows[0].createdAt)} GST)` : null}
        activeJob={getActiveJob(client.id)}
      />

      {selected ? (
        <>
          <p className="text-sm text-muted-foreground">
            {selected.id === rows[0]?.id ? "Latest audit" : "Audit"} · {stampLong(selected.createdAt)} GST
            {selected.id !== rows[0]?.id && (
              <>
                {" "}
                ·{" "}
                <Link href="/seo" className="text-primary hover:underline">
                  Back to latest
                </Link>
              </>
            )}
          </p>
          {selected.kind === "v2" ? (
            <ReportView key={selected.id} auditId={selected.id} scores={selected.scores} payload={selected.payload} recommendations={selected.recommendations} />
          ) : (
            <>
              <LegacyScoreCards audit={selected} />
              <FindingsList findings={selected.findings} recommendations={selected.recommendations} />
              <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">This audit was run with the earlier, shorter audit. Start a new one for the full report with grades, per-page results and exports.</p>
            </>
          )}
        </>
      ) : (
        <EmptyState
          icon={Search}
          title={client.website ? "No audits yet" : "No website to audit"}
          description={client.website ? "An audit crawls the site, runs Lighthouse and checks on-page SEO, schema, speed and indexing, then grades each area and lists what to fix first." : "Add the client's website to their profile, then come back to run an audit."}
        >
          {client.website ? (
            <StartAuditButton />
          ) : (
            <Link href={`/clients/${client.id}/edit`} className={buttonVariants()}>
              Add a website
            </Link>
          )}
        </EmptyState>
      )}

      {rows.length > 0 && <History rows={rows} selectedId={selected?.id ?? null} website={client.website} />}
    </div>
  )
}

/* ----------------------------------------------------- older audits (v1) */

function legacySummary(category: CategoryId, scores: AuditScores, findings: Finding[]) {
  const has = (id: string) => findings.some((f) => f.id === id)
  const critical = findings.filter((f) => f.category === category && f.severity === "critical").length
  switch (category) {
    case "onPage":
      return [`${scores.pages} ${scores.pages === 1 ? "page" : "pages"} analysed${scores.truncated ? " (crawl limit reached)" : ""}`, critical ? `${critical} critical ${critical === 1 ? "issue" : "issues"} in titles and headings` : "Titles, headings and metadata look sound"]
    case "schema":
      return [has("schema-local") ? "No MovingCompany or LocalBusiness schema found" : has("schema-any") ? "No structured data found" : "Local business schema found", has("schema-fields") ? "Name, address or phone missing from it" : has("schema-page") ? "Some inner pages have no markup" : "Markup is in place"]
    case "speed": {
      const lh = scores.speed.lighthouse
      return lh
        ? [`LCP ${lh.lcpMs != null ? (lh.lcpMs / 1000).toFixed(1) + " s" : "n/a"} · CLS ${lh.cls != null ? lh.cls.toFixed(2) : "n/a"}`, `TBT ${lh.tbtMs != null ? Math.round(lh.tbtMs) + " ms" : "n/a"} · Lighthouse mobile`]
        : ["Lighthouse did not run", "Estimated from page load times"]
    }
    case "indexation":
      return [has("robots-exists") ? "No robots.txt" : has("robots-blocks-all") ? "robots.txt blocks all crawlers" : "robots.txt is fine", has("sitemap-exists") ? "No sitemap.xml" : has("sitemap-valid") ? "Sitemap is empty or invalid" : "Sitemap found"]
  }
}

function LegacyScoreCards({ audit }: { audit: Extract<AuditRow, { kind: "v1" }> }) {
  const { scores, findings } = audit
  return (
    <section aria-label="Scores" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={scoreTone(scores.overall).label === "At risk" ? "destructive" : "default"}>Overall {scores.overall}/100</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CATEGORIES.map((c) => {
          const cat = scores[c.id]
          const tone = scoreTone(cat.score)
          const [line1, line2] = legacySummary(c.id, scores, findings)
          return (
            <Card key={c.id} className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Eyebrow>{c.eyebrow}</Eyebrow>
                  <h3 className="mt-0.5 font-semibold">{c.label}</h3>
                </div>
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", tone.text, "bg-muted")}>{tone.label}</span>
              </div>
              <div className="flex items-center gap-4">
                <ScoreRing score={cat.score} label={c.label} />
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{line1}</p>
                  <p>{line2}</p>
                  {c.id === "speed" && scores.speed.estimated && <p className="italic">Estimate</p>}
                </div>
              </div>
              <p className="mt-auto flex justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                <span>Passing checks</span>
                <span className="font-medium text-foreground tabular-nums">
                  {cat.passed} / {cat.total}
                </span>
              </p>
            </Card>
          )
        })}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ history */

function History({ rows, selectedId, website }: { rows: AuditRow[]; selectedId: string | null; website: string | null }) {
  return (
    <section aria-label="Audit history" className="space-y-3">
      <div>
        <h2 className="font-semibold">Audit history</h2>
        <p className="text-sm text-muted-foreground">Crawl log{website ? ` for ${website.replace(/^https?:\/\//, "")}` : ""}, latest {rows.length} {rows.length === 1 ? "run" : "runs"}.</p>
      </div>
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-left text-[11px] tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Crawl date</th>
              <th className="px-4 py-3 font-medium">Overall</th>
              <th className="px-4 py-3 font-medium">Change</th>
              <th className="px-4 py-3 font-medium">High priority</th>
              <th className="px-4 py-3 font-medium">Other issues</th>
              <th className="px-4 py-3 text-right font-medium">Report</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const prev = rows[i + 1]
              const delta = prev ? r.overall - prev.overall : null
              return (
                <tr key={r.id} className={cn(r.id === selectedId && "bg-primary/5")}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {stamp(r.createdAt)} {i === 0 && <Badge variant="muted" className="ml-1">Latest</Badge>} {r.kind === "v1" && <Badge variant="outline" className="ml-1">Earlier audit</Badge>}
                  </td>
                  <td className="px-4 py-3 font-medium tabular-nums">
                    {r.overall} / 100{r.kind === "v2" && ` · ${r.scores.grade}`}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {delta === null ? <span className="text-muted-foreground">Base crawl</span> : <span className={delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta < 0 ? "text-destructive" : "text-muted-foreground"}>{delta > 0 ? `+${delta}` : delta} pts</span>}
                  </td>
                  <td className="px-4 py-3 text-destructive tabular-nums">{r.high}</td>
                  <td className="px-4 py-3 text-amber-600 tabular-nums dark:text-amber-400">{r.other}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/seo?audit=${r.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      {r.id === selectedId ? "Viewing" : "View"}
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
