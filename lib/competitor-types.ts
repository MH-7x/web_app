/** Types and pure helpers for the competitor research behind the landing page generator. No server imports. */

import { containsPhrase, words } from "@/lib/audit/text"

export const MAX_COMPETITOR_URLS = 5
export const COMPETITOR_CACHE_DAYS = 30

/** What is kept about one competitor page. The text is only used to measure keyword use and is never shown or sent to a model. */
export type CompetitorPage = {
  url: string
  finalUrl: string
  /** ISO time of the crawl */
  fetchedAt: string
  status: number
  language: "en" | "ar"
  title: string
  metaDescription: string
  h1: string
  /** H2 and H3 headings in page order */
  outline: { level: 2 | 3; text: string }[]
  wordCount: number
  faqQuestions: string[]
  hasFaq: boolean
  hasProcess: boolean
  schemaTypes: string[]
  ctas: { tel: boolean; whatsapp: boolean; form: boolean }
  hasReviews: boolean
  hasMap: boolean
  images: { count: number; withAlt: number; altSamples: string[] }
  readingEase: number | null
  /** main copy, capped; stays in the cache */
  text: string
}

/** A page as shown to the user and sent to the model: no text, plus keyword use for the keywords being targeted. */
export type CompetitorSummary = Omit<CompetitorPage, "text"> & {
  cached: boolean
  keyword: { inTitle: boolean; inH1: boolean; inFirst100: boolean; inHeading: boolean; uses: number; density: number; secondaryFound: string[] }
}

export type CompetitorBenchmark = {
  pages: number
  wordCountMedian: number
  h2Median: number
  imageMedian: number
  faqMedian: number
  /** share of pages (0-100) that have each element */
  faqPercent: number
  processPercent: number
  reviewsPercent: number
  schemaPercent: number
  telPercent: number
  whatsappPercent: number
  formPercent: number
  keywordInTitlePercent: number
  keywordInH1Percent: number
  readingEaseMedian: number | null
}

/** The strategist's read of the ranking pages. Everything here is guidance for the writer, never copy. */
export type SerpBrief = {
  intent: string
  winningPattern: string
  commonSections: string[]
  contentGaps: string[]
  faqThemes: string[]
  differentiation: string[]
  recommendedWordCount: { min: number; max: number }
  recommendedImageCount: number
  notes: string
  /** figures measured from the pages, filled in by the app (not by the model) */
  benchmark: CompetitorBenchmark
  /** the URLs the brief is based on */
  sources: string[]
}

const median = (values: number[]) => {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}
const percent = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0)

export function buildBenchmark(pages: CompetitorSummary[]): CompetitorBenchmark {
  const n = pages.length
  const ease = pages.map((p) => p.readingEase).filter((v): v is number => v !== null)
  return {
    pages: n,
    wordCountMedian: median(pages.map((p) => p.wordCount)),
    h2Median: median(pages.map((p) => p.outline.filter((o) => o.level === 2).length)),
    imageMedian: median(pages.map((p) => p.images.count)),
    faqMedian: median(pages.map((p) => p.faqQuestions.length)),
    faqPercent: percent(pages.filter((p) => p.hasFaq).length, n),
    processPercent: percent(pages.filter((p) => p.hasProcess).length, n),
    reviewsPercent: percent(pages.filter((p) => p.hasReviews).length, n),
    schemaPercent: percent(pages.filter((p) => p.schemaTypes.length > 0).length, n),
    telPercent: percent(pages.filter((p) => p.ctas.tel).length, n),
    whatsappPercent: percent(pages.filter((p) => p.ctas.whatsapp).length, n),
    formPercent: percent(pages.filter((p) => p.ctas.form).length, n),
    keywordInTitlePercent: percent(pages.filter((p) => p.keyword.inTitle).length, n),
    keywordInH1Percent: percent(pages.filter((p) => p.keyword.inH1).length, n),
    readingEaseMedian: ease.length ? median(ease) : null,
  }
}

/** Where the targeted keywords sit on a competitor page. */
export function keywordUse(page: CompetitorPage, primary: string, secondary: string[]): CompetitorSummary["keyword"] {
  const all = words(page.text)
  const first100 = all.slice(0, 100).join(" ")
  const k = words(primary)
  let uses = 0
  if (k.length) for (let i = 0; i + k.length <= all.length; i++) if (k.every((t, j) => all[i + j] === t)) uses++
  return {
    inTitle: containsPhrase(page.title, primary),
    inH1: containsPhrase(page.h1, primary),
    inFirst100: containsPhrase(first100, primary),
    inHeading: page.outline.some((o) => containsPhrase(o.text, primary)),
    uses,
    density: all.length ? Math.round(((uses * k.length) / all.length) * 1000) / 10 : 0,
    secondaryFound: secondary.filter((s) => containsPhrase(page.text, s)),
  }
}

export function summarize(page: CompetitorPage, cached: boolean, primary: string, secondary: string[]): CompetitorSummary {
  const rest: Partial<CompetitorPage> = { ...page }
  delete rest.text
  return { ...(rest as Omit<CompetitorPage, "text">), cached, keyword: keywordUse(page, primary, secondary) }
}

/* ------------------------------------------------------------- validation */

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback)
const text = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const strings = (v: unknown, max = 10, each = 300) => (Array.isArray(v) ? v.map((x) => text(x, each)).filter(Boolean).slice(0, max) : [])

function normalizeBenchmark(raw: unknown): CompetitorBenchmark {
  const b = isObject(raw) ? raw : {}
  const ease = b.readingEaseMedian
  return {
    pages: num(b.pages),
    wordCountMedian: num(b.wordCountMedian),
    h2Median: num(b.h2Median),
    imageMedian: num(b.imageMedian),
    faqMedian: num(b.faqMedian),
    faqPercent: num(b.faqPercent),
    processPercent: num(b.processPercent),
    reviewsPercent: num(b.reviewsPercent),
    schemaPercent: num(b.schemaPercent),
    telPercent: num(b.telPercent),
    whatsappPercent: num(b.whatsappPercent),
    formPercent: num(b.formPercent),
    keywordInTitlePercent: num(b.keywordInTitlePercent),
    keywordInH1Percent: num(b.keywordInH1Percent),
    readingEaseMedian: typeof ease === "number" && Number.isFinite(ease) ? ease : null,
  }
}

/** Coerce a brief that came from the model or from a request body; null when there is nothing usable. */
export function normalizeSerpBrief(raw: unknown): SerpBrief | null {
  if (!isObject(raw)) return null
  const wc = isObject(raw.recommendedWordCount) ? raw.recommendedWordCount : {}
  const min = Math.round(num(wc.min))
  const max = Math.round(num(wc.max))
  const brief: SerpBrief = {
    intent: text(raw.intent, 800),
    winningPattern: text(raw.winningPattern, 1200),
    commonSections: strings(raw.commonSections, 12, 100),
    contentGaps: strings(raw.contentGaps, 10, 300),
    faqThemes: strings(raw.faqThemes, 12, 200),
    differentiation: strings(raw.differentiation, 6, 300),
    recommendedWordCount: { min: Math.max(0, Math.min(min, max || min)), max: Math.max(min, max) },
    recommendedImageCount: Math.min(20, Math.max(0, Math.round(num(raw.recommendedImageCount)))),
    notes: text(raw.notes, 800),
    benchmark: normalizeBenchmark(raw.benchmark),
    sources: strings(raw.sources, MAX_COMPETITOR_URLS, 500),
  }
  return brief.intent || brief.winningPattern ? brief : null
}

/**
 * How long the new page must be to match or beat the pages that rank: at least 10% above their median and inside the
 * range the analysis recommended. Zero when there is nothing to go on.
 */
export function wordTarget(brief: SerpBrief | null | undefined): { min: number; max: number } {
  if (!brief) return { min: 0, max: 0 }
  const median = brief.benchmark.wordCountMedian
  const min = Math.max(brief.recommendedWordCount.min, Math.round(median * 1.1))
  if (min <= 0) return { min: 0, max: 0 }
  return { min, max: Math.max(brief.recommendedWordCount.max, Math.round(min * 1.4)) }
}

/** The reading ease the English copy must reach: plain English (60), or 5 points easier than the ranking pages if that is higher. */
export function readingTarget(brief: SerpBrief | null | undefined) {
  const median = brief?.benchmark.readingEaseMedian
  return Math.min(70, Math.max(60, typeof median === "number" ? median + 5 : 0))
}

/** The brief as a compact block for a prompt. */
export function briefAsText(brief: SerpBrief) {
  const b = brief.benchmark
  const target = wordTarget(brief)
  const lines = [
    `Search intent: ${brief.intent}`,
    `How ranking pages are built: ${brief.winningPattern}`,
    brief.contentGaps.length && `Topics few or none of them cover (opportunities): ${brief.contentGaps.join("; ")}`,
    brief.faqThemes.length && `Question themes that recur: ${brief.faqThemes.join("; ")}`,
    brief.differentiation.length && `Angles to stand out: ${brief.differentiation.join("; ")}`,
    target.max > 0 && `Target length: ${target.min} to ${target.max} words in total (the pages that rank have a median of ${b.wordCountMedian}; ours must match or beat it)`,
    brief.commonSections.length && `REQUIRED sections (the page must contain every one of these, as a section of its own or as one of the fixed sections): ${brief.commonSections.join("; ")}`,
    brief.recommendedImageCount > 0 && `Recommended image count: ${brief.recommendedImageCount}`,
    b.pages > 0 &&
      `Measured on ${b.pages} pages: median ${b.wordCountMedian} words, ${b.h2Median} H2s, ${b.imageMedian} images, ${b.faqMedian} FAQ questions; ${b.faqPercent}% have an FAQ, ${b.processPercent}% a process section, ${b.reviewsPercent}% visible reviews, ${b.whatsappPercent}% a WhatsApp button, ${b.telPercent}% a call button; keyword in the title on ${b.keywordInTitlePercent}% and in the H1 on ${b.keywordInH1Percent}%.`,
    brief.notes && `Notes: ${brief.notes}`,
  ]
  return lines.filter(Boolean).join("\n")
}

/** Competitor URLs from a request: http(s) only, deduplicated, at most MAX_COMPETITOR_URLS. */
export function parseCompetitorUrls(raw: unknown): string[] {
  const given = typeof raw === "string" ? raw.split(/[\s,]+/) : Array.isArray(raw) ? raw : []
  const out: string[] = []
  for (const item of given) {
    const value = typeof item === "string" ? item.trim() : ""
    if (!value) continue
    const url = normalizeCompetitorUrl(value)
    if (url && !out.includes(url)) out.push(url)
  }
  return out.slice(0, MAX_COMPETITOR_URLS)
}

/** One form per page: https assumed when the scheme is missing, no hash, no trailing slash except the root. */
export function normalizeCompetitorUrl(raw: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    if (!u.hostname.includes(".")) return null
    u.hash = ""
    u.hostname = u.hostname.toLowerCase()
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "")
    return u.toString()
  } catch {
    return null
  }
}
