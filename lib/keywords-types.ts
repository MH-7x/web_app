/** Shared shapes for the keyword library. No server imports, so the UI can use them too. */

export const COMPETITIONS = ["Low", "Medium", "High"] as const
export type Competition = (typeof COMPETITIONS)[number]

/** One row of a Google Keyword Planner export. Bids are in AED. */
export type KeywordRow = {
  keyword: string
  avgMonthlySearches: number
  /** e.g. "23%", "-17%", "0%" */
  threeMonthChange: string
  /** empty when the export did not say */
  competition: Competition | ""
  topOfPageBidLow: number
  topOfPageBidHigh: number
}

export type KeywordGroupSummary = {
  id: string
  name: string
  clientId: string | null
  count: number
  updatedAt: string
}

export type KeywordGroupData = Omit<KeywordGroupSummary, "count"> & { keywords: KeywordRow[] }

export const MAX_KEYWORDS_PER_GROUP = 20_000

export const keyOf = (keyword: string) => keyword.trim().toLowerCase()

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** "23", "+23%", "-17.4 %" -> "23%", "23%", "-17%"; anything unreadable is "0%". */
export function normalizeChange(v: unknown) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""))
  return `${Number.isFinite(n) ? Math.round(n) : 0}%`
}

export function normalizeCompetition(v: unknown): Competition | "" {
  const s = String(v ?? "").trim().toLowerCase()
  return COMPETITIONS.find((c) => c.toLowerCase() === s) ?? ""
}

/** A row from untrusted input, or null when it has no keyword. */
export function normalizeRow(raw: unknown): KeywordRow | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const keyword = typeof r.keyword === "string" ? r.keyword.trim().replace(/\s+/g, " ").slice(0, 200) : ""
  if (!keyword) return null
  return {
    keyword,
    avgMonthlySearches: Math.round(num(r.avgMonthlySearches)),
    threeMonthChange: normalizeChange(r.threeMonthChange),
    competition: normalizeCompetition(r.competition),
    topOfPageBidLow: Math.round(num(r.topOfPageBidLow) * 100) / 100,
    topOfPageBidHigh: Math.round(num(r.topOfPageBidHigh) * 100) / 100,
  }
}

/** Valid rows only, one per keyword text (case-insensitive); the first occurrence wins. */
export function normalizeRows(raw: unknown): KeywordRow[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: KeywordRow[] = []
  for (const item of raw) {
    const row = normalizeRow(item)
    if (!row || seen.has(keyOf(row.keyword))) continue
    seen.add(keyOf(row.keyword))
    out.push(row)
  }
  return out
}

/** Add `incoming` to `existing`. A keyword already present is left alone ("skip") or overwritten ("update"). */
export function mergeRows(existing: KeywordRow[], incoming: KeywordRow[], onDuplicate: "skip" | "update") {
  const index = new Map(existing.map((r, i) => [keyOf(r.keyword), i]))
  const merged = [...existing]
  let added = 0
  let updated = 0
  let skipped = 0
  for (const row of incoming) {
    const at = index.get(keyOf(row.keyword))
    if (at === undefined) {
      index.set(keyOf(row.keyword), merged.length)
      merged.push(row)
      added++
    } else if (onDuplicate === "update") {
      merged[at] = row
      updated++
    } else skipped++
  }
  return { merged, added, updated, skipped }
}
