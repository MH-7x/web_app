import { CATEGORIES, type ClientCategory } from "@/lib/constants"

/** Types, constants and pure calculations for citation management. Safe to import from client components. */

export const CITATION_STATUSES = ["unchecked", "listed", "not_listed", "issues_found"] as const
export type CitationStatus = (typeof CITATION_STATUSES)[number]
export const isCitationStatus = (v: unknown): v is CitationStatus => (CITATION_STATUSES as readonly unknown[]).includes(v)

export const STATUS_LABEL: Record<CitationStatus, string> = {
  unchecked: "Unchecked",
  listed: "Listed",
  not_listed: "Not listed",
  issues_found: "Issues found",
}

/** A NAP citation is a directory listing checked for name, address, phone and website; a backlink only needs a live link to the client's site. */
export const SOURCE_TYPES = ["nap_citation", "backlink"] as const
export type SourceType = (typeof SOURCE_TYPES)[number]
export const isSourceType = (v: unknown): v is SourceType => (SOURCE_TYPES as readonly unknown[]).includes(v)
export const SOURCE_TYPE_LABEL: Record<SourceType, string> = { nap_citation: "NAP Citations", backlink: "Backlinks" }

export const LINK_STATUSES = ["pending", "live", "dead"] as const
export type LinkStatus = (typeof LINK_STATUSES)[number]
export const isLinkStatus = (v: unknown): v is LinkStatus => (LINK_STATUSES as readonly unknown[]).includes(v)
export const LINK_STATUS_LABEL: Record<LinkStatus | "none", string> = { none: "Not created", pending: "Pending", live: "Live", dead: "Dead" }

export const SOURCE_CATEGORIES = [
  { id: "general", label: "General" },
  { id: "industry", label: "Industry-specific" },
  { id: "uae-local", label: "UAE local" },
  { id: "international", label: "International" },
  { id: "social", label: "Social" },
  { id: "maps", label: "Maps" },
  // backlink sources
  { id: "web2", label: "Web 2.0" },
  { id: "profile", label: "Profile" },
  { id: "forum", label: "Forum & Q&A" },
  { id: "classified", label: "Classifieds" },
] as const
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number]["id"]
export const isSourceCategory = (v: unknown): v is SourceCategory => SOURCE_CATEGORIES.some((c) => c.id === v)
export const categoryLabel = (id: string) => SOURCE_CATEGORIES.find((c) => c.id === id)?.label ?? id

export const PRIORITIES = ["high", "medium", "low"] as const
export type Priority = (typeof PRIORITIES)[number]
export const isPriority = (v: unknown): v is Priority => (PRIORITIES as readonly unknown[]).includes(v)
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

export const TIERS = [1, 2, 3, 4] as const
export const TIER_LABEL: Record<number, string> = { 1: "Tier 1 · Must have", 2: "Tier 2 · UAE directories", 3: "Tier 3 · Industry specific", 4: "Tier 4 · General and international" }

/** What a client's category can be tagged "relevant for". "all" applies to every category. */
export const RELEVANT_FOR = ["all", ...CATEGORIES] as const
export const isRelevantFor = (v: unknown): v is (typeof RELEVANT_FOR)[number] => (RELEVANT_FOR as readonly unknown[]).includes(v)

/** The fields the dashboard checks: a citation is correct when each of these matches the client's real details. */
export const MATCH_FIELDS = ["name", "address", "phone", "website"] as const
export type MatchField = (typeof MATCH_FIELDS)[number]
export const MATCH_LABEL: Record<MatchField, string> = { name: "Name", address: "Address", phone: "Phone", website: "Website" }

/** Everything a directory might let a business fill in. The first four are the ones that are scored. */
export const SOURCE_FIELDS = ["name", "address", "phone", "website", "email", "hours", "description", "photos"] as const
export type SourceField = (typeof SOURCE_FIELDS)[number]
export const isSourceField = (v: unknown): v is SourceField => (SOURCE_FIELDS as readonly unknown[]).includes(v)

export type SourceDTO = {
  id: string
  name: string
  url: string
  submitUrl: string
  sourceType: SourceType
  category: string
  domainAuthority: number
  relevantFor: string[]
  napFields: string[]
  isFree: boolean
  priority: string
  tier: number
  notes: string
}

export type CitationDTO = {
  id: string
  status: CitationStatus
  nameMatch: boolean
  addressMatch: boolean
  phoneMatch: boolean
  websiteMatch: boolean
  listingUrl: string
  /** backlink sources only: the page that links to the client's site, and whether it is live. "" means no link has been created. */
  linkUrl: string
  linkStatus: LinkStatus | ""
  linkCreatedAt: string | null
  issues: string[]
  /** ticked off in the action plan */
  actionDone: boolean
  lastChecked: string | null
  source: SourceDTO
}

export const isBacklink = (c: Pick<CitationDTO, "source">) => c.source.sourceType === "backlink"
export const isNapCitation = (c: Pick<CitationDTO, "source">) => c.source.sourceType !== "backlink"

export type CompetitorDTO = { id: string; name: string; sourceIds: string[] }

export const matchOf = (c: Pick<CitationDTO, "nameMatch" | "addressMatch" | "phoneMatch" | "websiteMatch">, field: MatchField) =>
  field === "name" ? c.nameMatch : field === "address" ? c.addressMatch : field === "phone" ? c.phoneMatch : c.websiteMatch

/** A directory that doesn't list its supported fields is assumed to take all four. */
export const tracksField = (source: Pick<SourceDTO, "napFields">, field: MatchField) => source.napFields.length === 0 || source.napFields.includes(field)

/** A listing exists on the directory (even if some of its details are wrong). */
export const isListed = (c: Pick<CitationDTO, "status">) => c.status === "listed" || c.status === "issues_found"

/** Is this directory relevant to a client of this category? */
export const isRelevant = (relevantFor: string[], category: ClientCategory) => relevantFor.length === 0 || relevantFor.includes("all") || relevantFor.includes(category)

/* ------------------------------------------------------------------- score */

export const SEVERITIES = ["critical", "high", "medium", "low"] as const
export type Severity = (typeof SEVERITIES)[number]
export const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" }

const FIELD_ISSUE: Record<MatchField, { severity: Severity; label: string }> = {
  phone: { severity: "critical", label: "Wrong phone number" },
  address: { severity: "high", label: "Wrong or missing address" },
  website: { severity: "medium", label: "Wrong or missing website URL" },
  name: { severity: "low", label: "Inconsistent business name" },
}

export type NapIssue = { citationId: string; sourceName: string; field: MatchField; severity: Severity; label: string }

export type NapScore = {
  /** whole percent, or null until at least one listing has been recorded */
  score: number | null
  correctFields: number
  totalFields: number
  /** listings that exist on a directory: the ones that are scored */
  listedCount: number
  /** every directory being tracked for the client */
  trackedCount: number
  notListedCount: number
  uncheckedCount: number
  issues: NapIssue[]
}

/** NAP consistency: correct name, address, phone and website fields across every listing, divided by the fields that were checked. Backlink sources have no NAP details and are left out. */
export function computeScore(all: CitationDTO[]): NapScore {
  const citations = all.filter(isNapCitation)
  const listed = citations.filter(isListed)
  const issues: NapIssue[] = []
  let total = 0
  let correct = 0
  for (const c of listed) {
    for (const field of MATCH_FIELDS) {
      if (!tracksField(c.source, field)) continue
      total++
      if (matchOf(c, field)) correct++
      else issues.push({ citationId: c.id, sourceName: c.source.name, field, ...FIELD_ISSUE[field] })
    }
  }
  const rank = (s: Severity) => SEVERITIES.indexOf(s)
  issues.sort((a, b) => rank(a.severity) - rank(b.severity) || a.sourceName.localeCompare(b.sourceName))
  return {
    score: total ? Math.round((correct / total) * 100) : null,
    correctFields: correct,
    totalFields: total,
    listedCount: listed.length,
    trackedCount: citations.length,
    notListedCount: citations.filter((c) => c.status === "not_listed").length,
    uncheckedCount: citations.filter((c) => c.status === "unchecked").length,
    issues,
  }
}

export type BacklinkScore = {
  /** backlink sources tracked for the client */
  total: number
  /** links confirmed live */
  live: number
  pending: number
  dead: number
  /** no link recorded yet */
  notCreated: number
}

export function computeBacklinks(all: CitationDTO[]): BacklinkScore {
  const links = all.filter(isBacklink)
  const count = (s: LinkStatus) => links.filter((c) => c.linkStatus === s).length
  return { total: links.length, live: count("live"), pending: count("pending"), dead: count("dead"), notCreated: links.filter((c) => !c.linkStatus).length }
}

/** One row of the all-clients overview: how a single client's citations are doing. */
export type ClientNapSummary = {
  client: CitationClient
  score: number | null
  correctFields: number
  totalFields: number
  trackedCount: number
  listedCount: number
  /** listings that exist but have a wrong detail (status "issues found") */
  issueCount: number
  notListedCount: number
  uncheckedCount: number
}

export function summarizeClient(client: CitationClient, citations: CitationDTO[]): ClientNapSummary {
  const nap = computeScore(citations)
  return {
    client,
    score: nap.score,
    correctFields: nap.correctFields,
    totalFields: nap.totalFields,
    trackedCount: nap.trackedCount,
    listedCount: nap.listedCount,
    issueCount: citations.filter((c) => c.status === "issues_found").length,
    notListedCount: nap.notListedCount,
    uncheckedCount: nap.uncheckedCount,
  }
}

/** Every client's citations pooled together; the score is correct fields over checked fields across all of them. */
export function aggregateSummaries(rows: ClientNapSummary[]) {
  const sum = (pick: (r: ClientNapSummary) => number) => rows.reduce((total, r) => total + pick(r), 0)
  const correctFields = sum((r) => r.correctFields)
  const totalFields = sum((r) => r.totalFields)
  return {
    score: totalFields ? Math.round((correctFields / totalFields) * 100) : null,
    correctFields,
    totalFields,
    clientCount: rows.length,
    trackingCount: rows.filter((r) => r.trackedCount > 0).length,
    trackedCount: sum((r) => r.trackedCount),
    listedCount: sum((r) => r.listedCount),
    issueCount: sum((r) => r.issueCount),
    uncheckedCount: sum((r) => r.uncheckedCount),
  }
}

/** green above 80, yellow 50 to 80, red below 50 */
export const scoreTone = (score: number | null) => (score === null ? "none" : score > 80 ? "good" : score >= 50 ? "warn" : "bad")

/** The issues recorded for a citation, in the words the UI shows. */
export function issuesFor(c: Pick<CitationDTO, "nameMatch" | "addressMatch" | "phoneMatch" | "websiteMatch"> & { source: Pick<SourceDTO, "napFields"> }) {
  return MATCH_FIELDS.filter((f) => tracksField(c.source, f) && !matchOf(c, f)).map((f) => FIELD_ISSUE[f].label)
}

/* -------------------------------------------------------------------- plan */

export type PlanItem = {
  citationId: string
  sourceName: string
  action: "fix" | "submit" | "build"
  /** where to go: the live listing to fix, or the page to submit a new one */
  url: string
  detail: string
  priority: string
  /** backlink sources only: the domain authority the plan is sorted by */
  domainAuthority?: number
  done: boolean
}

export type PlanStep = { id: "fix" | "tier1" | "tier2" | "tier3" | "tier4" | "backlinks"; title: string; description: string; items: PlanItem[] }

export type CitationPlan = { steps: PlanStep[]; remaining: number; total: number; uncheckedCount: number }

const byPriority = (a: CitationDTO, b: CitationDTO) => (PRIORITY_RANK[a.source.priority] ?? 1) - (PRIORITY_RANK[b.source.priority] ?? 1) || a.source.name.localeCompare(b.source.name)

/**
 * What to do next, in order: fix listings with wrong details (they hurt rankings), then submit to the directories the client
 * is missing from: Tier 1, Tier 2, industry specific (Tier 3) and the rest. Directories not checked yet aren't assumed missing.
 * Backlinks come last: every backlink source without a working link, highest domain authority first.
 */
export function buildPlan(all: CitationDTO[]): CitationPlan {
  const citations = all.filter(isNapCitation)
  const fix: PlanItem[] = citations
    .filter((c) => c.status === "issues_found")
    .sort(byPriority)
    .map((c) => ({
      citationId: c.id,
      sourceName: c.source.name,
      action: "fix",
      url: c.listingUrl || c.source.url,
      detail: (c.issues.length ? c.issues : issuesFor(c)).join(", ") || "Details don't match",
      priority: c.source.priority,
      done: c.actionDone,
    }))

  const missing = (tier: number): PlanItem[] =>
    citations
      .filter((c) => c.status === "not_listed" && (tier === 4 ? c.source.tier >= 4 : c.source.tier === tier))
      .sort(byPriority)
      .map((c) => ({
        citationId: c.id,
        sourceName: c.source.name,
        action: "submit",
        url: c.source.submitUrl || c.source.url,
        detail: `${c.source.isFree ? "Free" : "Paid"} · ${categoryLabel(c.source.category)}${c.source.notes ? ` · ${c.source.notes}` : ""}`,
        priority: c.source.priority,
        done: c.actionDone,
      }))

  const steps: PlanStep[] = [
    { id: "fix", title: "Fix existing listings", description: "Listed, but with wrong details. These actively hurt local rankings, so they come first.", items: fix },
    { id: "tier1", title: "Submit to missing Tier 1 directories", description: "The must-have listings every business should have.", items: missing(1) },
    { id: "tier2", title: "Submit to missing Tier 2 directories", description: "High-impact UAE directories.", items: missing(2) },
    { id: "tier3", title: "Submit to missing industry directories", description: "Directories for this kind of business.", items: missing(3) },
    { id: "tier4", title: "Submit to remaining directories", description: "General and international listings, last priority.", items: missing(4) },
    { id: "backlinks", title: "Backlinks to build", description: "Profiles and posts that link to the client's site and pass authority. Highest domain authority first. A link leaves this list once you record its URL.", items: buildBacklinks(all) },
  ]
  const items = steps.flatMap((s) => s.items)
  return { steps, remaining: items.filter((i) => !i.done).length, total: items.length, uncheckedCount: citations.filter((c) => c.status === "unchecked").length }
}

/** Backlink sources the client has no working link on yet (never created, or dead), sorted by domain authority, highest first. */
function buildBacklinks(all: CitationDTO[]): PlanItem[] {
  return all
    .filter((c) => isBacklink(c) && (!c.linkStatus || c.linkStatus === "dead"))
    .sort((a, b) => b.source.domainAuthority - a.source.domainAuthority || a.source.name.localeCompare(b.source.name))
    .map((c) => ({
      citationId: c.id,
      sourceName: c.source.name,
      action: "build",
      url: c.source.submitUrl || c.source.url,
      detail: `${c.linkStatus === "dead" ? "Link is dead, rebuild it" : categoryLabel(c.source.category)}${c.source.domainAuthority ? ` · DA ${c.source.domainAuthority}` : ""}${c.source.notes ? ` · ${c.source.notes}` : ""}`,
      priority: c.source.priority,
      domainAuthority: c.source.domainAuthority,
      done: false,
    }))
}

/* ------------------------------------------------------------- competitors */

export type CompetitorComparison = {
  id: string
  name: string
  /** tracked directories the competitor is on */
  listedOn: number
  /** directories the competitor is on and the client is not (not listed, or not checked yet) */
  missingFromClient: { id: string; name: string; unchecked: boolean }[]
}

export function compareCompetitor(competitor: CompetitorDTO, citations: CitationDTO[]): CompetitorComparison {
  const on = new Set(competitor.sourceIds)
  const theirs = citations.filter((c) => isNapCitation(c) && on.has(c.source.id))
  return {
    id: competitor.id,
    name: competitor.name,
    listedOn: theirs.length,
    missingFromClient: theirs.filter((c) => !isListed(c)).map((c) => ({ id: c.source.id, name: c.source.name, unchecked: c.status === "unchecked" })),
  }
}

/* ------------------------------------------------------------------ checks */

const hostOf = (url: string) => {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, "")
  } catch {
    return url
  }
}

/** A search that shows whether the client is on this directory: a Google site: search, or Google Maps for Google's own listing. */
export function checkUrl(source: Pick<SourceDTO, "url">, clientName: string) {
  const host = hostOf(source.url)
  if (/(^|\.)google\./i.test(host)) return `https://www.google.com/maps/search/${encodeURIComponent(clientName)}`
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${host} "${clientName}"`)}`
}

/** The client the Citations page is working on. */
export type CitationClient = { id: string; name: string; category: ClientCategory; emirate: string }
