/** Types, validation and the maths for monthly reports. No server imports, so the UI can use them. */

import { BadRequestError } from "@/lib/content-types"

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

/* ---------------------------------------------------------------- metrics */

export const METRIC_FIELDS = [
  { id: "impressions", label: "Impressions", kind: "count", placeholder: "24,500" },
  { id: "clicks", label: "Clicks", kind: "count", placeholder: "1,230" },
  { id: "ctr", label: "CTR (%)", kind: "percent", placeholder: "Calculated if left empty" },
  { id: "gbpViews", label: "GBP Views", kind: "count", placeholder: "8,340" },
  { id: "gbpCalls", label: "GBP Calls", kind: "count", placeholder: "47" },
  { id: "adSpend", label: "Ad Spend (AED)", kind: "money", placeholder: "3,200" },
  { id: "conversions", label: "Conversions", kind: "count", placeholder: "38" },
] as const

export type MetricId = (typeof METRIC_FIELDS)[number]["id"]
export type Metrics = Partial<Record<MetricId, number>>
export type MetricInput = Partial<Record<MetricId, string>>

const KIND = Object.fromEntries(METRIC_FIELDS.map((f) => [f.id, f.kind])) as Record<MetricId, "count" | "percent" | "money">
const LABEL = Object.fromEntries(METRIC_FIELDS.map((f) => [f.id, f.label.replace(/ \(.*\)$/, "")])) as Record<MetricId, string>

function parseNumber(label: string, raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined
  const text = String(raw).replace(/[,\s]/g, "").replace(/^AED/i, "").replace(/%$/, "")
  if (!text) return undefined
  const n = Number(text)
  if (!Number.isFinite(n)) throw new BadRequestError(`${label} must be a number.`)
  if (n < 0) throw new BadRequestError(`${label} cannot be negative.`)
  if (n > 1e12) throw new BadRequestError(`${label} is too large.`)
  return n
}

/** Validate one month's numbers. Empty fields are left out; counts must be whole numbers. */
export function parseMetrics(raw: unknown, which = ""): Metrics {
  const o = isObject(raw) ? raw : {}
  const out: Metrics = {}
  for (const f of METRIC_FIELDS) {
    const name = `${which}${f.label.replace(/ \(.*\)$/, "")}`
    const n = parseNumber(name, o[f.id])
    if (n === undefined) continue
    if (f.kind === "count" && !Number.isInteger(n)) throw new BadRequestError(`${name} must be a whole number.`)
    if (f.kind === "percent" && n > 100) throw new BadRequestError(`${name} cannot be more than 100.`)
    out[f.id] = f.kind === "money" ? Math.round(n * 100) / 100 : n
  }
  if (out.clicks !== undefined && out.impressions !== undefined && out.clicks > out.impressions) {
    throw new BadRequestError(`${which}Clicks cannot be higher than impressions.`)
  }
  if (out.conversions !== undefined && out.clicks !== undefined && out.conversions > out.clicks) {
    throw new BadRequestError(`${which}Conversions cannot be higher than clicks.`)
  }
  return out
}

export const hasMetrics = (m: Metrics) => Object.keys(m).length > 0

/** CTR is worked out from clicks and impressions when it was not typed in. */
export function withCtr(m: Metrics): Metrics {
  if (m.ctr !== undefined || m.clicks === undefined || !m.impressions) return m
  return { ...m, ctr: Math.round((m.clicks / m.impressions) * 10000) / 100 }
}

/* ------------------------------------------------------------------ months */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export type Month = { key: string; label: string; nextLabel: string; previousLabel: string }

/** "2026-10" -> labels. Throws on anything else. */
export function parseMonth(value: unknown): Month {
  const m = typeof value === "string" ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value) : null
  if (!m) throw new BadRequestError("Choose a month.")
  const year = Number(m[1])
  const index = Number(m[2]) - 1
  if (year < 2000 || year > 2100) throw new BadRequestError("Choose a valid month.")
  const label = (y: number, i: number) => `${MONTHS[(i + 12) % 12]} ${y + Math.floor(i / 12)}`
  return { key: m[0], label: label(year, index), nextLabel: label(year, index + 1), previousLabel: label(year, index - 1) }
}

/* ------------------------------------------------------------------- stats */

export type Stat = {
  id: MetricId | "costPerConversion"
  label: string
  value: number
  display: string
  /** change against the previous month, in percent; absent when no previous figure was given */
  change?: { pct: number; tone: "good" | "bad" | "neutral" }
}

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US")
const fmtMoney = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`

function display(id: Stat["id"], n: number) {
  if (id === "ctr") return `${n.toFixed(2).replace(/\.?0+$/, "")}%`
  if (id === "costPerConversion") return fmtMoney(Math.round(n * 100) / 100)
  return KIND[id] === "money" ? fmtMoney(n) : fmtInt(n)
}

const LOWER_IS_BETTER = new Set<Stat["id"]>(["costPerConversion"])
const NEUTRAL = new Set<Stat["id"]>(["adSpend"])

function costPerConversion(m: Metrics) {
  return m.adSpend !== undefined && m.conversions ? m.adSpend / m.conversions : undefined
}

/** The figures shown as cards, with month-over-month change where a previous month was supplied. */
export function buildStats(current: Metrics, previous?: Metrics): Stat[] {
  const cur = withCtr(current)
  const prev = previous ? withCtr(previous) : undefined
  const values: [Stat["id"], string, number | undefined, number | undefined][] = [
    ...METRIC_FIELDS.map((f) => [f.id, LABEL[f.id], cur[f.id], prev?.[f.id]] as [Stat["id"], string, number | undefined, number | undefined]),
    ["costPerConversion", "Cost per Conversion", costPerConversion(cur), prev && costPerConversion(prev)],
  ]
  return values.flatMap(([id, label, value, before]) => {
    if (value === undefined) return []
    const stat: Stat = { id, label, value, display: display(id, value) }
    if (before !== undefined && before > 0) {
      const pct = Math.round(((value - before) / before) * 100)
      const up = pct > 0
      stat.change = { pct, tone: pct === 0 || NEUTRAL.has(id) ? "neutral" : up !== LOWER_IS_BETTER.has(id) ? "good" : "bad" }
    }
    return [stat]
  })
}

/* ------------------------------------------------------------------ report */

export type Report = { summary: string; wins: string[]; improvements: string[]; recommendations: string[] }

export type ReportRequest = { clientId: string; month: Month; metrics: Metrics; previous?: Metrics }

export function parseReportRequest(raw: unknown): ReportRequest {
  const o = isObject(raw) ? raw : {}
  if (typeof o.clientId !== "string" || !o.clientId) throw new BadRequestError("Select a client first.")
  const month = parseMonth(o.month)
  const metrics = parseMetrics(o.metrics)
  if (!hasMetrics(metrics)) throw new BadRequestError("Enter at least one figure for the month.")
  const previous = parseMetrics(o.previous, "Previous month: ")
  return { clientId: o.clientId, month, metrics, previous: hasMetrics(previous) ? previous : undefined }
}

export function renderReportMarkdown(clientName: string, month: Month, stats: Stat[], r: Report) {
  const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n")
  const cards = stats.map((s) => `- ${s.label}: ${s.display}${s.change ? ` (${s.change.pct > 0 ? "+" : ""}${s.change.pct}% vs ${month.previousLabel})` : ""}`).join("\n")
  return [
    `# Monthly Performance Report`,
    `${clientName} · ${month.label}`,
    `## Executive Summary\n\n${r.summary}`,
    `## Key Metrics\n\n${cards}`,
    `## Wins\n\n${bullets(r.wins)}`,
    `## Areas to Improve\n\n${bullets(r.improvements)}`,
    `## Recommendations for ${month.nextLabel.split(" ")[0]}\n\n${bullets(r.recommendations)}`,
  ].join("\n\n")
}
