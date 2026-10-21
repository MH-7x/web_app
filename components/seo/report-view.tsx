"use client"

import { AlertTriangle, ChevronDown, CircleHelp, CircleX, Download, FileCode, FileText, Info, ShieldAlert, TriangleAlert, CircleCheck } from "lucide-react"
import { useMemo, useState } from "react"

import { ScoreRing, scoreTone } from "@/components/seo/score-ring"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, Eyebrow } from "@/components/ui/card"
import { GROUPS } from "@/lib/audit/groups"
import type { AuditPayloadV2, AuditScoresV2, CheckResult, CheckStatus, GroupId, PageRecord, Priority, RecommendationV2 } from "@/lib/audit/types"
import { cn } from "@/lib/utils"

const STATUS: Record<CheckStatus, { label: string; chip: string; icon: typeof Info }> = {
  pass: { label: "Pass", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", icon: CircleCheck },
  warning: { label: "Warning", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300", icon: TriangleAlert },
  fail: { label: "Fail", chip: "bg-destructive/15 text-destructive", icon: CircleX },
  not_checked: { label: "Not checked", chip: "bg-muted text-muted-foreground ring-1 ring-dashed ring-foreground/20", icon: CircleHelp },
}

const PRIORITY: Record<Priority, { label: string; chip: string }> = {
  high: { label: "High", chip: "bg-destructive text-white" },
  medium: { label: "Medium", chip: "bg-amber-500/20 text-amber-700 dark:text-amber-300" },
  low: { label: "Low", chip: "bg-primary/10 text-primary" },
}

const groupLabel = (id: GroupId) => GROUPS.find((g) => g.id === id)?.label ?? id

function StatusChip({ status }: { status: CheckStatus }) {
  const s = STATUS[status]
  const Icon = s.icon
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", s.chip)}>
      <Icon className="size-3.5" /> {s.label}
    </span>
  )
}

/** Affected URLs, either flat or in named groups (for example pages sharing one title). */
function Affected({ check }: { check: Pick<CheckResult, "urls" | "groups"> }) {
  if (check.groups?.length)
    return (
      <div className="space-y-3">
        {check.groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1 text-xs font-medium">{g.label}</p>
            <ul className="space-y-1 font-mono text-xs">
              {g.urls.slice(0, 12).map((u) => (
                <li key={u} className="truncate rounded bg-muted px-2 py-1" title={u}>
                  {u}
                </li>
              ))}
              {g.urls.length > 12 && <li className="px-2 text-muted-foreground">+{g.urls.length - 12} more</li>}
            </ul>
          </div>
        ))}
      </div>
    )
  if (!check.urls.length) return null
  return (
    <ul className="max-h-60 space-y-1 overflow-y-auto font-mono text-xs">
      {check.urls.map((u, i) => (
        <li key={`${i}-${u}`} className="truncate rounded bg-muted px-2 py-1" title={u}>
          {u}
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ header */

function Header({ auditId, scores, payload }: { auditId: string; scores: AuditScoresV2; payload: AuditPayloadV2 }) {
  const tone = scoreTone(scores.overall)
  const exports = [
    { format: "json", label: "JSON", icon: FileCode },
    { format: "html", label: "HTML report", icon: FileText },
    { format: "md", label: "Markdown", icon: Download },
  ]
  return (
    <section className="space-y-4" aria-label="Summary">
      {payload.crawl.confidenceNotes.length > 0 && (
        <div role="status" className={cn("flex items-start gap-3 rounded-xl px-4 py-3 text-sm", payload.crawl.confidence === "low" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-800 dark:text-amber-300")}>
          {payload.crawl.confidence === "low" ? <ShieldAlert className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          <div className="space-y-1">
            <p className="font-medium">{payload.crawl.confidence === "low" ? "The site blocked the crawler: these results may be incomplete or inaccurate" : "Some results may be incomplete"}</p>
            <ul className="list-disc space-y-0.5 ps-4">
              {payload.crawl.confidenceNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Card className="flex flex-wrap items-center gap-6 p-6">
        <ScoreRing score={scores.overall} grade={scores.grade} size={116} label="Overall score" />
        <div className="min-w-64 flex-1 space-y-2">
          <Eyebrow>{tone.label}</Eyebrow>
          <h2 className="text-xl font-semibold tracking-tight">{scores.verdict}</h2>
          <p className="text-sm text-muted-foreground">
            {scores.pages} {scores.pages === 1 ? "page" : "pages"} audited{scores.truncated ? ` (stopped at the ${scores.config.maxPages}-page limit)` : ""} · {Math.floor(scores.durationSec / 60)}m {scores.durationSec % 60}s · confidence {scores.confidence}
            {scores.config.targetKeyword ? ` · keyword “${scores.config.targetKeyword}”` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {payload.crawl.isServiceAreaBusiness ? "No street address was found on the site, so this is audited as a service-area business (address checks are skipped)." : `Business address found on the site: ${payload.crawl.addressFound}`}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Export</p>
          <div className="flex flex-wrap gap-2">
            {exports.map(({ format, label, icon: Icon }) => (
              <a key={format} href={`/api/seo/export?audit=${auditId}&format=${format}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Icon /> {label}
              </a>
            ))}
          </div>
        </div>
      </Card>
    </section>
  )
}

function GroupGrid({ scores, onPick }: { scores: AuditScoresV2; onPick: (g: GroupId) => void }) {
  return (
    <section aria-label="Grades by group" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {GROUPS.map((g) => {
        const s = scores.groups[g.id]
        return (
          <button key={g.id} type="button" onClick={() => onPick(g.id)} className="flex flex-col gap-3 rounded-xl bg-card p-4 text-start ring-1 ring-foreground/10 transition-shadow hover:ring-primary/40">
            <div className="flex items-center gap-3">
              <ScoreRing score={s.score} grade={s.grade} size={64} label={g.label} />
              <div className="min-w-0">
                <p className="font-semibold leading-tight">{g.label}</p>
                <p className="text-xs text-muted-foreground">{s.score === null ? "Not graded" : scoreTone(s.score).label}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">{s.passed} pass</span> · <span className="text-amber-600 dark:text-amber-400">{s.warnings} warn</span> · <span className="text-destructive">{s.failed} fail</span>
              {s.notChecked > 0 && <> · {s.notChecked} not checked</>}
            </p>
          </button>
        )
      })}
    </section>
  )
}

/* --------------------------------------------------------- recommendations */

function Recommendations({ recs }: { recs: RecommendationV2[] }) {
  const [filter, setFilter] = useState<"all" | Priority>("all")
  const shown = filter === "all" ? recs : recs.filter((r) => r.priority === filter)
  const count = (p: Priority) => recs.filter((r) => r.priority === p).length
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Filter by priority" className="flex flex-wrap items-center gap-2">
        {(["all", "high", "medium", "low"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn("h-8 rounded-lg px-3 text-sm font-medium transition-colors", filter === f ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground hover:bg-muted")}>
            {f === "all" ? "All" : PRIORITY[f].label} ({f === "all" ? recs.length : count(f)})
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">High first</span>
      </div>
      {shown.length === 0 ? (
        <div className="rounded-xl bg-card px-6 py-12 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">{recs.length === 0 ? "Nothing to fix. Nice work." : "Nothing at this priority."}</div>
      ) : (
        <ol className="space-y-3">
          {shown.map((r) => (
            <li key={r.id}>
              <details className="group rounded-xl bg-card ring-1 ring-foreground/10 open:ring-foreground/20">
                <summary className="flex cursor-pointer list-none items-start gap-3 p-4 marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className={cn("mt-0.5 rounded px-2 py-0.5 text-xs font-semibold", PRIORITY[r.priority].chip)}>{PRIORITY[r.priority].label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {groupLabel(r.group)}
                      {r.urls.length > 0 && ` · ${r.urls.length}${r.urls.length >= 30 ? "+" : ""} affected`}
                    </p>
                  </div>
                  <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 border-t border-border px-4 py-4">
                  <p className="text-sm">{r.fix}</p>
                  <Affected check={{ urls: r.urls }} />
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ checks */

function ChecksByGroup({ scores, checks, focus }: { scores: AuditScoresV2; checks: CheckResult[]; focus: GroupId | null }) {
  const [status, setStatus] = useState<"all" | CheckStatus>("all")
  const visible = (g: GroupId) => (focus ? g === focus : true)
  const filterCount = (s: CheckStatus) => checks.filter((c) => c.status === s && visible(c.group)).length
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Filter by status" className="flex flex-wrap items-center gap-2">
        {(["all", "fail", "warning", "pass", "not_checked"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={cn("h-8 rounded-lg px-3 text-sm font-medium transition-colors", status === s ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground hover:bg-muted")}>
            {s === "all" ? "All" : STATUS[s].label} ({s === "all" ? checks.filter((c) => visible(c.group)).length : filterCount(s)})
          </button>
        ))}
      </div>

      {GROUPS.filter((g) => visible(g.id)).map((g) => {
        const rows = checks.filter((c) => c.group === g.id && (status === "all" || c.status === status))
        if (!rows.length) return null
        const s = scores.groups[g.id]
        return (
          <section key={g.id} id={`group-${g.id}`} aria-label={g.label} className="space-y-2 scroll-mt-20">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-semibold">{g.label}</h3>
              <Badge variant="muted">{s.score === null ? "Not graded" : `${s.score}/100 · ${s.grade}`}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{g.why}</p>
            <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
              {rows.map((c) => {
                const hasDetail = (c.urls.length > 0 || (c.groups?.length ?? 0) > 0) && c.status !== "pass"
                const header = (
                  <>
                    <StatusChip status={c.status} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{c.value}</span>
                        {` · ${c.message}`}
                      </p>
                    </div>
                  </>
                )
                return (
                  <li key={c.id}>
                    {hasDetail || (c.fix && c.status !== "pass" && c.status !== "not_checked") ? (
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-start gap-3 p-3.5 marker:hidden [&::-webkit-details-marker]:hidden">
                          {header}
                          <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="space-y-3 border-t border-border bg-muted/20 px-4 py-3">
                          {c.fix && c.status !== "pass" && c.status !== "not_checked" && (
                            <p className="text-sm">
                              <span className="font-medium">How to fix: </span>
                              {c.fix}
                            </p>
                          )}
                          <Affected check={c} />
                        </div>
                      </details>
                    ) : (
                      <div className="flex items-start gap-3 p-3.5">{header}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------- pages */

function Pages({ pages, checks }: { pages: PageRecord[]; checks: CheckResult[] }) {
  const names = useMemo(() => new Map(checks.map((c) => [c.id, c.name])), [checks])
  const [onlyIssues, setOnlyIssues] = useState(false)
  const sorted = useMemo(() => [...pages].sort((a, b) => b.failures - a.failures || b.warnings - a.warnings || a.path.localeCompare(b.path)), [pages])
  const shown = onlyIssues ? sorted.filter((p) => p.failures + p.warnings > 0) : sorted
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">Every check that runs per page, for each of the {pages.length} URLs found in the crawl and sitemap.</p>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Only pages with issues
        </label>
      </div>
      <ul className="space-y-2">
        {shown.map((p) => {
          const entries = Object.entries(p.results)
          const problems = entries.filter(([, s]) => s === "fail" || s === "warning").sort((a, b) => (a[1] === b[1] ? 0 : a[1] === "fail" ? -1 : 1))
          const unchecked = entries.filter(([, s]) => s === "not_checked")
          const passes = entries.filter(([, s]) => s === "pass").length
          return (
            <li key={p.url}>
              <details className="group rounded-xl bg-card ring-1 ring-foreground/10 open:ring-foreground/20">
                <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3.5 marker:hidden sm:grid-cols-[minmax(0,1fr)_5rem_6rem_9rem_1.5rem] [&::-webkit-details-marker]:hidden">
                  <span className="truncate font-mono text-sm" title={p.url}>
                    {p.path}
                  </span>
                  <span className={cn("text-sm tabular-nums max-sm:hidden", p.status >= 400 && "font-semibold text-destructive")}>HTTP {p.status}</span>
                  <span className="text-xs text-muted-foreground max-sm:hidden">{p.depth === null ? "not linked" : `${p.depth} ${p.depth === 1 ? "click" : "clicks"}`}</span>
                  <span className="flex gap-1.5 text-xs tabular-nums">
                    {p.failures > 0 && <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-semibold text-destructive">{p.failures} fail</span>}
                    {p.warnings > 0 && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700 dark:text-amber-300">{p.warnings} warn</span>}
                    {p.failures + p.warnings === 0 && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">clean</span>}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 max-sm:hidden" />
                </summary>
                <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
                  <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                    <Fact label="Title" value={p.title ? `${p.title} (${p.titleLength} chars)` : "none"} />
                    <Fact label="Meta description" value={p.metaLength ? `${p.metaLength} chars` : "none"} />
                    <Fact label="H1" value={p.h1 || "none"} />
                    <Fact label="Words" value={String(p.wordCount)} />
                    <Fact label="Canonical" value={p.canonical || "none"} />
                    <Fact label="Language" value={p.lang || "not declared"} />
                    <Fact label="Internal links in" value={String(p.inlinks)} />
                    <Fact label="In sitemap" value={p.inSitemap ? "yes" : "no"} />
                    {p.redirectHops > 0 && <Fact label="Redirects before this page" value={String(p.redirectHops)} />}
                  </dl>
                  {problems.length > 0 && (
                    <ul className="space-y-1">
                      {problems.map(([id, s]) => (
                        <li key={id} className="flex items-center gap-2">
                          <StatusChip status={s} /> <span>{names.get(id) ?? id}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {passes} checks passed{unchecked.length > 0 ? ` · ${unchecked.length} could not be checked` : ""}.
                  </p>
                </div>
              </details>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-2">
    <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
    <dd className="min-w-0 flex-1 break-words">{value}</dd>
  </div>
)

/* -------------------------------------------------------------- crawl log */

const secs = (v: number | null) => (v == null ? "n/a" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)

function CrawlLog({ scores, payload }: { scores: AuditScoresV2; payload: AuditPayloadV2 }) {
  const errors = payload.crawl.errors
  const crux = scores.crux
  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Crawl</h3>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Fact label="Pages crawled" value={`${payload.crawl.pagesCrawled} of ${payload.crawl.pagesAttempted} attempted`} />
          <Fact label="Sitemap URLs" value={String(payload.crawl.sitemapUrls)} />
          <Fact label="Crawl limit" value={payload.crawl.truncated ? `reached (${scores.config.maxPages} pages)` : "not reached"} />
          <Fact label="Confidence" value={scores.confidence} />
        </dl>
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Speed tests (Lighthouse lab data)</h3>
        {scores.lighthouse.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lighthouse did not run, so speed figures were not measured.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-[11px] tracking-wider text-muted-foreground uppercase">
                <tr>
                  {["Page", "Device", "Score", "FCP", "Speed Index", "LCP", "TBT", "CLS"].map((h) => (
                    <th key={h} className="py-2 pr-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scores.lighthouse.map((l) => (
                  <tr key={l.url + l.device}>
                    <td className="py-2 pr-4 font-mono text-xs">{new URL(l.url).pathname || "/"}</td>
                    <td className="py-2 pr-4">{l.device}</td>
                    <td className={cn("py-2 pr-4 font-semibold tabular-nums", scoreTone(l.score).text)}>{l.score}</td>
                    <td className="py-2 pr-4 tabular-nums">{secs(l.fcpMs)}</td>
                    <td className="py-2 pr-4 tabular-nums">{secs(l.speedIndexMs)}</td>
                    <td className="py-2 pr-4 tabular-nums">{secs(l.lcpMs)}</td>
                    <td className="py-2 pr-4 tabular-nums">{secs(l.tbtMs)}</td>
                    <td className="py-2 pr-4 tabular-nums">{l.cls?.toFixed(2) ?? "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {scores.lighthouse[0]?.opportunities.length ? (
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-sm font-medium">Biggest opportunities (homepage, mobile)</p>
            <ul className="space-y-1 text-sm">
              {scores.lighthouse[0].opportunities.slice(0, 8).map((o) => (
                <li key={o.id} className="flex justify-between gap-3">
                  <span>{o.title}</span>
                  <span className="text-muted-foreground tabular-nums">{o.savingsMs ? `about ${secs(o.savingsMs)}` : o.savingsBytes ? `${Math.round(o.savingsBytes / 1024)} KB` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Real-user Core Web Vitals (Chrome UX Report)</h3>
        {crux && crux.records.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {crux.records.map((r) => (
              <li key={r.url + r.device} className="flex flex-wrap gap-x-4">
                <span className="font-medium">
                  {r.device === "phone" ? "Phone" : "Desktop"} · {r.scope === "origin" ? "whole site" : "this page"}
                </span>
                <span>LCP {r.lcp?.p75 != null ? secs(r.lcp.p75) : "n/a"}</span>
                <span>INP {r.inp?.p75 != null ? `${Math.round(r.inp.p75)} ms` : "n/a"}</span>
                <span>CLS {r.cls?.p75 ?? "n/a"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Not checked: {crux?.unavailable ?? "real-user data was not requested."}</p>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Fetch errors and blocked requests</h3>
        {errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests failed during the crawl.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto font-mono text-xs">
            {errors.map((e, i) => (
              <li key={`${i}-${e.url}`} className="rounded bg-muted px-2 py-1">
                <span className="font-semibold">{e.kind}</span> {e.url} <span className="text-muted-foreground">({e.message})</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------- shell */

const TABS = [
  { id: "recs", label: "Recommendations" },
  { id: "checks", label: "Results by group" },
  { id: "pages", label: "Pages" },
  { id: "crawl", label: "Crawl and speed" },
] as const

export function ReportView({ auditId, scores, payload, recommendations }: { auditId: string; scores: AuditScoresV2; payload: AuditPayloadV2; recommendations: RecommendationV2[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("recs")
  const [focus, setFocus] = useState<GroupId | null>(null)

  return (
    <div className="space-y-6">
      <Header auditId={auditId} scores={scores} payload={payload} />
      <GroupGrid
        scores={scores}
        onPick={(g) => {
          setFocus(g)
          setTab("checks")
        }}
      />

      <div role="tablist" aria-label="Report sections" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors", tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
            {t.id === "recs" && <Badge variant="muted" className="ml-2">{recommendations.length}</Badge>}
            {t.id === "pages" && <Badge variant="muted" className="ml-2">{payload.pages.length}</Badge>}
          </button>
        ))}
      </div>

      {tab === "recs" && <Recommendations recs={recommendations} />}
      {tab === "checks" && (
        <div className="space-y-3">
          {focus && (
            <button type="button" onClick={() => setFocus(null)} className="text-sm text-primary hover:underline">
              Showing {groupLabel(focus)} only. Show all groups
            </button>
          )}
          <ChecksByGroup scores={scores} checks={payload.checks} focus={focus} />
        </div>
      )}
      {tab === "pages" && <Pages pages={payload.pages} checks={payload.checks} />}
      {tab === "crawl" && <CrawlLog scores={scores} payload={payload} />}
    </div>
  )
}
