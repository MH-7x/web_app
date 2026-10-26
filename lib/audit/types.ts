/** Shared shapes for the SEO audit. No server imports, so the UI can use them too. */

export type Severity = "critical" | "warning" | "info"
export type Grade = "A" | "B" | "C" | "D" | "F"

/* ============================================================ v2 (current) */

export type GroupId = "onPage" | "geo" | "links" | "usability" | "performance" | "social" | "local" | "technology" | "multilingual" | "crawlHealth"

export type CheckStatus = "pass" | "warning" | "fail" | "not_checked"
export type Priority = "high" | "medium" | "low"

/** One check's outcome across the whole site, with the per-URL detail behind it. */
export type CheckResult = {
  id: string
  group: GroupId
  name: string
  status: CheckStatus
  /** how serious a failure of this check is; drives the recommendation priority */
  severity: Severity
  /** what was detected, in a few words */
  value: string
  /** one line explaining the result */
  message: string
  /** affected URLs or targets (capped) */
  urls: string[]
  /** grouped findings, e.g. pages sharing the same title */
  groups?: { label: string; urls: string[] }[]
  /** how many items the check looked at, and how many of them failed */
  checked: number
  failed: number
  /** why a check could not run (status "not_checked") */
  reason?: string
  /** specific fix */
  fix?: string
}

export type PageCheckStatus = "pass" | "warning" | "fail" | "not_checked"

export type PageRecord = {
  url: string
  path: string
  status: number
  /** clicks from the homepage; null when only reachable from the sitemap */
  depth: number | null
  title: string
  titleLength: number
  metaLength: number
  h1: string
  wordCount: number
  canonical: string
  lang: string
  inlinks: number
  redirectHops: number
  inSitemap: boolean
  /** per-check status for the checks that run on every page */
  results: Record<string, PageCheckStatus>
  failures: number
  warnings: number
}

export type CrawlErrorKind = "timeout" | "dns" | "blocked" | "http" | "network" | "other"
export type CrawlError = { url: string; kind: CrawlErrorKind; status: number; message: string }

export type CrawlSummary = {
  origin: string
  startUrl: string
  pagesCrawled: number
  pagesAttempted: number
  /** the crawl budget ran out before every discovered page was visited */
  truncated: boolean
  sitemapUrls: number
  /** the site refused or failed to answer enough requests that results may be incomplete */
  blocked: boolean
  confidence: "high" | "medium" | "low"
  confidenceNotes: string[]
  errors: CrawlError[]
  isServiceAreaBusiness: boolean
  addressFound: string | null
}

export type LighthouseOpportunity = { id: string; title: string; savingsMs: number; savingsBytes: number }

export type LighthouseRun = {
  url: string
  device: "mobile" | "desktop"
  score: number
  fcpMs: number | null
  speedIndexMs: number | null
  lcpMs: number | null
  tbtMs: number | null
  cls: number | null
  opportunities: LighthouseOpportunity[]
}

export type CruxMetric = { p75: number | null; good: number | null; needsImprovement: number | null; poor: number | null }
export type CruxRecord = {
  url: string
  /** "url" = data for the page itself, "origin" = the whole site (used when the page has too little traffic) */
  scope: "url" | "origin"
  device: "phone" | "desktop"
  lcp: CruxMetric | null
  inp: CruxMetric | null
  cls: CruxMetric | null
  fcp: CruxMetric | null
  ttfb: CruxMetric | null
}
export type CruxResult = { records: CruxRecord[]; unavailable: string | null }

export type GroupScore = {
  /** null when nothing in the group could be checked */
  score: number | null
  grade: Grade | null
  passed: number
  warnings: number
  failed: number
  notChecked: number
  total: number
}

export type AuditScoresV2 = {
  version: 2
  groups: Record<GroupId, GroupScore>
  overall: number
  grade: Grade
  verdict: string
  pages: number
  truncated: boolean
  durationSec: number
  confidence: "high" | "medium" | "low"
  /** targetKeyword/targetUrl are only set on audits run before multi-keyword checks existed */
  config: { targetKeyword?: string | null; targetUrl?: string | null; maxPages: number }
  lighthouse: LighthouseRun[]
  crux: CruxResult | null
}

export type RecommendationV2 = {
  id: string
  checkId: string
  group: GroupId
  priority: Priority
  action: string
  fix: string
  urls: string[]
}

/** What is stored in Audit.findings for a v2 audit. */
export type AuditPayloadV2 = {
  version: 2
  checks: CheckResult[]
  pages: PageRecord[]
  crawl: CrawlSummary
}

/** A page and the primary keyword it should be optimised for. `url` is a path such as /services/villa-moving. */
export type KeywordPair = { url: string; keyword: string }

export type AuditInput = { keywordPairs: KeywordPair[] }

/** How well one page is optimised for its keyword: each flag is "the keyword appears there". */
export type KeywordCheck = {
  url: string
  keyword: string
  /** false when no crawled page matched `url`; the flags are then all false */
  found: boolean
  inTitle: boolean
  inH1: boolean
  inFirst100: boolean
  inUrl: boolean
  inMeta: boolean
  /** how many of the five places contain the keyword, 0-5 */
  score: number
}

export type LogLevel = "info" | "warn" | "error"
export type LogEntry = { timestamp: number; level: LogLevel; message: string }

/* ================================================ v1 (older stored audits) */

export type CategoryId = "onPage" | "schema" | "speed" | "indexation"

export type LighthouseResult = {
  score: number
  lcpMs: number | null
  cls: number | null
  tbtMs: number | null
  fcpMs: number | null
}

export type Finding = {
  id: string
  category: CategoryId
  severity: Severity
  title: string
  detail: string
  targets: string[]
  count: number
}

export type Recommendation = { findingId: string; text: string }

export type CategoryScore = { score: number; passed: number; total: number }

export type AuditScores = {
  onPage: CategoryScore
  schema: CategoryScore
  speed: CategoryScore & { estimated: boolean; lighthouse: LighthouseResult | null }
  indexation: CategoryScore
  overall: number
  pages: number
  truncated: boolean
  durationSec: number
}

/* ==================================================================== jobs */

/** "waiting": the crawl is done and the audit is paused until the speed-test pages are chosen. */
export type JobStatus = "queued" | "running" | "waiting" | "completed" | "failed"

export type SpeedDevice = "mobile" | "desktop"

/** A crawled page that can be speed tested, offered to the user once the crawl has finished. */
export type SpeedCandidate = {
  url: string
  path: string
  title: string
  inlinks: number
  /** what the audit would test on its own: the homepage on both devices, the main service and area pages on mobile */
  suggested: SpeedDevice[]
}

export type SpeedSelection = { url: string; device: SpeedDevice }

export type JobSnapshot = {
  id: string
  clientId: string
  url: string
  status: JobStatus
  /** 0-100 */
  progress: number
  phase: string
  message: string
  /** the pages to choose from; only present while status is "waiting" */
  speedCandidates: SpeedCandidate[] | null
  /** log entries from index `logStart` on, oldest first */
  log: LogEntry[]
  logStart: number
  pagesCrawled: number
  auditId: string | null
  error: string | null
}
