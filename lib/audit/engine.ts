import { ALL_CHECKS } from "@/lib/audit/checks"
import { buildContext, plural, type CheckDef, type ClientProfile, type Ctx, type SiteOutcome } from "@/lib/audit/checks/util"
import { AUDIT_CONFIG, disabledChecks } from "@/lib/audit/config"
import type { CrawlResult } from "@/lib/audit/crawl-types"
import { GROUPS, gradeFor, priorityFor } from "@/lib/audit/groups"
import { checkKeywords } from "@/lib/audit/keywords"
import type { AuditLogger } from "@/lib/audit/log"
import {
  type AuditInput,
  type AuditPayloadV2,
  type AuditScoresV2,
  type CheckResult,
  type CheckStatus,
  type CrawlSummary,
  type CruxResult,
  type GroupId,
  type GroupScore,
  type KeywordCheck,
  type LighthouseRun,
  type PageCheckStatus,
  type PageRecord,
  type RecommendationV2,
  type Severity,
} from "@/lib/audit/types"

const WEIGHT: Record<Severity, number> = { critical: 3, warning: 2, info: 1 }
const SITE_UNIT_CAP = 10
const CRASH_REASON = "The check crashed while running."

const statusFor = (failed: boolean, severity: Severity): CheckStatus => (!failed ? "pass" : severity === "critical" ? "fail" : "warning")

type Contribution = { weight: number; passed: number }

/** Run one check and turn its outcome into a CheckResult plus its share of the group score. */
function runCheck(def: CheckDef, ctx: Ctx, pageStatuses: Map<string, Record<string, PageCheckStatus>>): { result: CheckResult; score: Contribution | null } | null {
  const base = { id: def.id, group: def.group, name: def.name, fix: def.fix }

  try {
    if (def.scope === "site") {
      const out: SiteOutcome = def.run(ctx)
      const severity = out.severity ?? def.severity
      const result: CheckResult = {
        ...base,
        status: out.status,
        severity,
        value: out.value,
        message: out.message,
        urls: (out.urls ?? []).slice(0, 100),
        groups: out.groups?.map((g) => ({ label: g.label, urls: g.urls.slice(0, 60) })),
        checked: out.checked ?? (out.status === "not_checked" ? 0 : 1),
        failed: out.failed ?? (out.status === "pass" || out.status === "not_checked" ? 0 : 1),
        reason: out.reason,
      }
      if (out.status === "not_checked") return { result, score: null }
      // a site check counts as up to 10 units, so a hundred broken links weigh more than one but cannot swamp the group
      const checked = Math.max(out.checked ?? 1, 1)
      const n = Math.min(checked, SITE_UNIT_CAP)
      const failShare = out.status === "pass" ? 0 : Math.min(1, (result.failed || 1) / checked)
      return { result, score: { weight: WEIGHT[severity] * n, passed: WEIGHT[severity] * n * (1 - failShare) } }
    }

    const skip = def.skipWhen?.(ctx)
    if (skip === "") return null // not relevant to this audit at all
    if (skip) return { result: { ...base, status: "not_checked", severity: def.severity, value: "Not checked", message: skip, urls: [], checked: 0, failed: 0, reason: skip }, score: null }

    const pages = def.pages ? def.pages(ctx) : ctx.html
    const units: { page: (typeof pages)[number]; unit: NonNullable<ReturnType<typeof def.test>> }[] = []
    for (const page of pages) {
      const unit = def.test(page, ctx)
      if (unit) units.push({ page, unit })
    }

    if (!units.length) {
      const reason = "This check did not apply to any page that was crawled."
      return { result: { ...base, status: "not_checked", severity: def.severity, value: "Not applicable", message: reason, urls: [], checked: 0, failed: 0, reason }, score: null }
    }

    let passedW = 0
    let totalW = 0
    let failedCount = 0
    let notCheckedCount = 0
    let worst: Severity | null = null
    for (const { page, unit } of units) {
      const severity = unit.severity ?? def.severity
      const failedUnit = !unit.pass && !unit.notChecked
      const st: PageCheckStatus = unit.notChecked ? "not_checked" : statusFor(failedUnit, severity)
      pageStatuses.set(page.url, { ...(pageStatuses.get(page.url) ?? {}), [def.id]: st })
      if (unit.notChecked) {
        notCheckedCount++
        continue
      }
      totalW += WEIGHT[severity]
      if (!failedUnit) passedW += WEIGHT[severity]
      else {
        failedCount++
        if (!worst || WEIGHT[severity] > WEIGHT[worst]) worst = severity
      }
    }

    const checked = units.length - notCheckedCount
    if (checked === 0) {
      const reason = units.find((u) => u.unit.notChecked)?.unit.notChecked ?? "Could not be checked."
      return { result: { ...base, status: "not_checked", severity: def.severity, value: "Not checked", message: reason, urls: [], checked: 0, failed: 0, reason }, score: null }
    }

    const extra = def.summarize?.(units, ctx)
    const failing = units.filter((u) => !u.unit.pass && !u.unit.notChecked)
    // a failing check takes the strongest severity any failing page carried
    const severity: Severity = worst ?? def.severity
    const status = statusFor(failedCount > 0, severity)
    const result: CheckResult = {
      ...base,
      status,
      severity,
      value: extra?.value ?? (failedCount ? `${failedCount} of ${checked} ${checked === 1 ? "page" : "pages"}` : `All ${checked} ${checked === 1 ? "page" : "pages"}`),
      message: failedCount ? `${failedCount} of ${checked} pages ${def.failMessage ?? "fail this check."}` : (def.passMessage ?? "Every page passes."),
      urls: failing.map((u) => u.unit.detail ?? u.page.path).slice(0, 100),
      groups: extra?.groups?.map((g) => ({ label: g.label, urls: g.urls.slice(0, 60) })),
      checked,
      failed: failedCount,
    }
    // like a site check, a page check counts as at most 10 units, so a 150-page crawl cannot let one check swamp the whole group
    const scale = Math.min(checked, SITE_UNIT_CAP) / checked
    return { result, score: { weight: totalW * scale, passed: passedW * scale } }
  } catch (error) {
    // one broken check must never take the audit down
    console.error(`[audit] check ${def.id} crashed:`, error)
    return { result: { ...base, status: "not_checked", severity: def.severity, value: "Not checked", message: "This check hit an unexpected error and was skipped.", urls: [], checked: 0, failed: 0, reason: CRASH_REASON }, score: null }
  }
}

function verdictFor(overall: number, confidence: AuditScoresV2["confidence"]) {
  const base = overall >= 90 ? "Your site is in very good shape." : overall >= 75 ? "Your site is in good shape, with a few fixes worth making." : overall >= 60 ? "Your site could be better." : "Your site needs significant work."
  return confidence === "low" ? `${base} The crawler was blocked, so treat this as a partial picture.` : base
}

export function runChecks(input: {
  crawl: CrawlResult
  client: ClientProfile
  audit: AuditInput
  lighthouse: LighthouseRun[]
  crux: CruxResult | null
  durationSec: number
  log?: AuditLogger
}): { scores: AuditScoresV2; payload: AuditPayloadV2; recommendations: RecommendationV2[]; keywordChecks: KeywordCheck[] } {
  const ctx = buildContext(input)
  const off = disabledChecks()
  const defs = ALL_CHECKS.filter((c) => !off.has(c.id))

  const pageStatuses = new Map<string, Record<string, PageCheckStatus>>()
  const results: CheckResult[] = []
  const contributions = new Map<GroupId, Contribution>()
  const log = input.log
  log?.("info", `Running ${defs.length} checks`)
  for (const def of defs) {
    const out = runCheck(def, ctx, pageStatuses)
    if (!out) continue
    results.push(out.result)
    if (log) {
      const r = out.result
      if (r.reason === CRASH_REASON) log("error", `Check crashed: ${r.name}`)
      else if (r.status === "not_checked") log("info", `Check skipped: ${r.name} (${r.reason ?? r.value})`)
      else if (r.status === "pass") log("info", `Check passed: ${r.name} (${r.value})`)
      else log("warn", `Check ${r.status === "fail" ? "failed" : "has a warning"}: ${r.name} (${r.value})`)
    }
    if (out.score) {
      const c = contributions.get(def.group) ?? { weight: 0, passed: 0 }
      c.weight += out.score.weight
      c.passed += out.score.passed
      contributions.set(def.group, c)
    }
  }

  /* ---- confidence ---- */
  const { crawl } = input
  const notes: string[] = []
  const failedFetches = crawl.errors.filter((e) => e.kind !== "blocked" && e.kind !== "http").length
  if (crawl.blocked) notes.push("The site refused or challenged the crawler (firewall or bot protection), so results may be incomplete or inaccurate.")
  else if (crawl.errors.some((e) => e.kind === "blocked")) notes.push("A few requests were refused by the site. Pages that were refused are missing from the results.")
  if (failedFetches) notes.push(`${plural(failedFetches, "request")} timed out or failed (see Crawl Health), which may hide some pages.`)
  if (crawl.truncated) notes.push(`The crawl stopped at ${AUDIT_CONFIG.maxPages} pages. Checks that compare pages (orphans, duplicates, sitemap) only cover what was visited.`)
  if (!input.lighthouse.length) notes.push("Lighthouse could not run, so speed figures are estimated from load times.")
  if (input.crux?.unavailable) notes.push(`Real-user Core Web Vitals were not available: ${input.crux.unavailable}`)
  const confidence: AuditScoresV2["confidence"] = crawl.blocked ? "low" : crawl.truncated || failedFetches > Math.max(3, crawl.attempted * 0.1) || !input.lighthouse.length ? "medium" : "high"
  if (confidence === "low") for (const r of results) if (r.status !== "not_checked") r.message += " Confidence: low, because the crawler was blocked."

  /* ---- groups ---- */
  const groups = Object.fromEntries(
    GROUPS.map((g) => {
      const mine = results.filter((r) => r.group === g.id)
      const c = contributions.get(g.id)
      // a group where hardly anything could be judged (for example Multilingual on an English-only site) gets no grade rather than an easy A
      const decided = mine.filter((r) => r.status !== "not_checked").length
      const score = c && c.weight > 0 && decided >= 2 && decided / Math.max(mine.length, 1) >= 0.3 ? Math.round((c.passed / c.weight) * 100) : null
      const row: GroupScore = {
        score,
        grade: score === null ? null : gradeFor(score),
        passed: mine.filter((r) => r.status === "pass").length,
        warnings: mine.filter((r) => r.status === "warning").length,
        failed: mine.filter((r) => r.status === "fail").length,
        notChecked: mine.filter((r) => r.status === "not_checked").length,
        total: mine.length,
      }
      return [g.id, row]
    })
  ) as Record<GroupId, GroupScore>

  const scored = Object.values(groups).filter((g): g is GroupScore & { score: number } => g.score !== null)
  const overall = scored.length ? Math.round(scored.reduce((n, g) => n + g.score, 0) / scored.length) : 0

  /* ---- pages ---- */
  const pages: PageRecord[] = ctx.pages.map((p) => {
    const results = pageStatuses.get(p.url) ?? {}
    const values = Object.values(results)
    return {
      url: p.url,
      path: p.path,
      status: p.status,
      depth: p.depth,
      title: p.raw?.title ?? "",
      titleLength: p.raw?.title.length ?? 0,
      metaLength: p.raw?.metaDescription.length ?? 0,
      h1: p.raw?.headings.find((h) => h.level === 1)?.text ?? "",
      wordCount: p.raw ? p.raw.bodyText.split(/\s+/).filter(Boolean).length : 0,
      canonical: p.raw?.canonicals[0] ?? "",
      lang: p.raw?.lang ?? "",
      inlinks: p.inlinks,
      redirectHops: Math.max(0, p.redirectChain.length - 1),
      inSitemap: p.inSitemap,
      results,
      failures: values.filter((v) => v === "fail").length,
      warnings: values.filter((v) => v === "warning").length,
    }
  })

  /* ---- recommendations, High first ---- */
  const order = { high: 0, medium: 1, low: 2 } as const
  const recommendations: RecommendationV2[] = results
    .filter((r) => (r.status === "fail" || r.status === "warning") && r.fix)
    .map((r) => ({
      id: `rec-${r.id}`,
      checkId: r.id,
      group: r.group,
      priority: priorityFor(r.severity),
      action: r.fix!.split(/(?<=[.!?])\s/)[0],
      fix: r.fix!,
      urls: (r.groups?.flatMap((g) => g.urls) ?? r.urls).slice(0, 30),
    }))
    .sort((a, b) => order[a.priority] - order[b.priority])

  const summary: CrawlSummary = {
    origin: crawl.origin,
    startUrl: crawl.startUrl,
    pagesCrawled: crawl.pages.length,
    pagesAttempted: crawl.attempted,
    truncated: crawl.truncated,
    sitemapUrls: crawl.sitemap?.urlCount ?? 0,
    blocked: crawl.blocked,
    confidence,
    confidenceNotes: notes,
    errors: crawl.errors.slice(0, 200),
    isServiceAreaBusiness: ctx.isServiceArea,
    addressFound: ctx.address.found,
  }

  const scores: AuditScoresV2 = {
    version: 2,
    groups,
    overall,
    grade: gradeFor(overall),
    verdict: verdictFor(overall, confidence),
    pages: crawl.pages.length,
    truncated: crawl.truncated,
    durationSec: input.durationSec,
    confidence,
    config: { maxPages: AUDIT_CONFIG.maxPages },
    lighthouse: input.lighthouse,
    crux: input.crux,
  }

  /* ---- keyword placement for the pages and keywords entered at the start ---- */
  const keywordChecks = checkKeywords(ctx, input.audit.keywordPairs)
  if (keywordChecks.length) {
    log?.("info", `Checking keyword placement for ${keywordChecks.length} ${keywordChecks.length === 1 ? "page" : "pages"}`)
    for (const k of keywordChecks) {
      if (!k.found) log?.("warn", `Keyword page not found during crawl: ${k.url}`)
      else log?.(k.score >= 3 ? "info" : "warn", `Keyword "${k.keyword}" on ${k.url}: ${k.score}/5`)
    }
  }

  return { scores, payload: { version: 2, checks: results, pages, crawl: summary }, recommendations, keywordChecks }
}
