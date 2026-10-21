import { AUDIT_CONFIG } from "@/lib/audit/config"
import type { CrawledPage, CrawlResult } from "@/lib/audit/crawl-types"
import { stripWww } from "@/lib/audit/crawler"
import { arabicRatio } from "@/lib/audit/text"
import type { AuditInput, CheckStatus, CruxResult, GroupId, LighthouseRun, Severity } from "@/lib/audit/types"

/**
 * Every check is one small object: an id, a group, a severity and a function. Page checks run once per page and are
 * rolled up site-wide; site checks look at the whole crawl. Add, remove or switch off a check without touching the rest.
 */

export type ClientProfile = {
  name: string
  nameAr: string
  phone: string
  whatsapp: string
  website: string | null
  services: string[]
  areas: string[]
  emirate: string
  emiratesServed: string[]
}

export type Ctx = {
  crawl: CrawlResult
  client: ClientProfile
  input: AuditInput
  lighthouse: LighthouseRun[]
  crux: CruxResult | null
  /** every page the crawler visited */
  pages: CrawledPage[]
  /** HTML pages that loaded (status below 400) */
  html: CrawledPage[]
  home: CrawledPage | undefined
  arabic: CrawledPage[]
  english: CrawledPage[]
  servicePages: CrawledPage[]
  areaPages: CrawledPage[]
  keyPages: Set<string>
  lookup: Map<string, CrawledPage>
  address: { found: string | null; sources: string[] }
  isServiceArea: boolean
  /** target page for keyword checks */
  targetPage: CrawledPage | undefined
}

/** What one page contributes to a page check. `null` from the test means the check does not apply to that page. */
export type Unit = { pass: boolean; detail?: string; severity?: Severity; notChecked?: string }

export type SiteOutcome = {
  status: CheckStatus
  value: string
  message: string
  urls?: string[]
  groups?: { label: string; urls: string[] }[]
  reason?: string
  checked?: number
  failed?: number
  severity?: Severity
}

type Meta = { id: string; group: GroupId; name: string; severity: Severity; fix?: string }

export type PageCheck = Meta & {
  scope: "page"
  /** which pages to run on; defaults to every loaded HTML page */
  pages?: (ctx: Ctx) => CrawledPage[]
  test: (page: CrawledPage, ctx: Ctx) => Unit | null
  /** custom roll-up text; the default reads "n of m pages ..." */
  summarize?: (units: { page: CrawledPage; unit: Unit }[], ctx: Ctx) => { value?: string; message?: string; groups?: SiteOutcome["groups"] }
  /** what to say when failing pages exist */
  failMessage?: string
  passMessage?: string
  /** a site-wide precondition; return a reason to mark the whole check "not checked" */
  skipWhen?: (ctx: Ctx) => string | null
}

export type SiteCheck = Meta & { scope: "site"; run: (ctx: Ctx) => SiteOutcome }

export type CheckDef = PageCheck | SiteCheck

export const pageCheck = (c: Omit<PageCheck, "scope">): PageCheck => ({ ...c, scope: "page" })
export const siteCheck = (c: Omit<SiteCheck, "scope">): SiteCheck => ({ ...c, scope: "site" })

/* ---------------------------------------------------------------- helpers */

export const pass = (value: string, message: string, extra: Partial<SiteOutcome> = {}): SiteOutcome => ({ status: "pass", value, message, ...extra })
export const fail = (value: string, message: string, extra: Partial<SiteOutcome> = {}): SiteOutcome => ({ status: "fail", value, message, ...extra })
export const warn = (value: string, message: string, extra: Partial<SiteOutcome> = {}): SiteOutcome => ({ status: "warning", value, message, ...extra })
export const notChecked = (reason: string, name = "Not checked"): SiteOutcome => ({ status: "not_checked", value: name, message: reason, reason })

/** pass, or a failure whose strength follows the check's severity */
export const verdict = (ok: boolean, severity: Severity): CheckStatus => (ok ? "pass" : severity === "critical" ? "fail" : "warning")

export const short = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1) + "…" : s)
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`
export const list = (items: string[], max = 3) => (items.length <= max ? items.join(", ") : `${items.slice(0, max).join(", ")} +${items.length - max} more`)

export const hostOf = (u: string) => {
  try {
    return stripWww(new URL(u).hostname)
  } catch {
    return ""
  }
}

/* ---------------------------------------------------------------- context */

const KEY_PATH = /contact|about|service|area|location|movers-in|moving|packing|storage|quote/i
const generic = new Set(["and", "the", "for", "moving", "service", "services", "company"])

const tokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !generic.has(w))

/** Language of a page from its lang attribute, URL and the script its text is written in. */
export function pageLanguage(p: CrawledPage): "ar" | "en" | "other" {
  const raw = p.raw
  if (!raw) return "other"
  const lang = raw.lang.toLowerCase()
  if (lang.startsWith("ar") || /^\/ar(\/|$)/i.test(p.path) || arabicRatio(raw.mainText) >= 0.5) return "ar"
  if (lang.startsWith("en") || arabicRatio(raw.mainText) < 0.05) return "en"
  return "other"
}

const ADDRESS = /(?:P\.?\s?O\.?\s?Box\s*\d+[^.|\n]{0,80}|(?:Office|Shop|Suite|Building|Bldg|Tower|Floor|Villa|Warehouse|Plot)\s*(?:No\.?)?\s*[\w-]*\d+[^.|\n]{0,100}|\d+[A-Za-z]?\s+[A-Za-z ]{3,30}(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?)\b[^.|\n]{0,60}|(?:شارع|مبنى|برج|طابق|مكتب|ص\.?\s?ب|صندوق بريد)[^.|\n]{3,90})/i

/**
 * Footers often run an address straight into the menu or social links (inline elements give no line break), so cut the
 * address at the first thing that is clearly navigation or contact detail, not part of a street address.
 */
const NOT_ADDRESS = /\b(?:Facebook|Twitter|Instagram|LinkedIn|YouTube|TikTok|About|Services?|Locations?|Contact|Home|Privacy|Terms|Copyright|Call|Phone|Tel|E-?mail|WhatsApp|Mobile|Open|Working hours)\b|©/i
export const trimAddress = (s: string) => s.split(NOT_ADDRESS)[0].replace(/\s+/g, " ").replace(/[,;|:-]+\s*$/, "").trim()

/** The street address a page shows, from its schema, an address element or its footer/contact text. Null when it shows none. */
export function pageAddress(p: CrawledPage): { text: string; source: "schema" | "address element" | "page text" } | null {
  const raw = p.raw
  if (!raw) return null
  const schema = raw.schema.find((n) => n.address?.street)
  if (schema?.address?.street) {
    const a = schema.address
    return { text: [a.street, a.locality, a.region, a.postal, a.country].filter(Boolean).join(", "), source: "schema" }
  }
  // an element whose class says "address" can wrap the whole footer: take just the address-shaped part, or the element itself when it is short
  for (const t of raw.addressEls) {
    const hit = ADDRESS.exec(t)?.[0]
    if (hit) return { text: short(trimAddress(hit), 160), source: "address element" }
    if (/\d/.test(t) && t.length <= 160) return { text: trimAddress(t), source: "address element" }
  }
  const where = [raw.footerText, raw.headerText, /contact/i.test(p.path) ? raw.mainText : ""].join("\n")
  const text = ADDRESS.exec(where)?.[0]
  return text ? { text: short(trimAddress(text), 160), source: "page text" } : null
}

export function discoverAddress(html: CrawledPage[]): { found: string | null; sources: string[] } {
  const sources: string[] = []
  let found: string | null = null
  for (const p of html) {
    const a = pageAddress(p)
    if (!a) continue
    found ??= a.text
    sources.push(`${p.path} (${a.source})`)
  }
  return { found, sources }
}

export function buildContext(input: {
  crawl: CrawlResult
  client: ClientProfile
  audit: AuditInput
  lighthouse: LighthouseRun[]
  crux: CruxResult | null
}): Ctx {
  const { crawl, client } = input
  const pages = crawl.pages
  const html = pages.filter((p) => p.raw && p.status > 0 && p.status < 400)
  const home = pages.find((p) => p.url === crawl.startUrl) ?? pages[0]

  const lookup = new Map<string, CrawledPage>()
  for (const p of pages) {
    lookup.set(p.url, p)
    lookup.set(p.requestedUrl, p)
  }

  const arabic = html.filter((p) => pageLanguage(p) === "ar")
  const english = html.filter((p) => pageLanguage(p) === "en")

  const serviceTokens = client.services.flatMap(tokens)
  const placeTokens = [client.emirate, ...client.emiratesServed, ...client.areas].flatMap(tokens)
  // the URL slug is what says "this page is about X"; titles and H1s such as "Movers in Dubai" appear on generic pages too
  const label = (p: CrawledPage) => decodeURIComponent(p.path).toLowerCase()
  const isHome = (p: CrawledPage) => p === home
  const areaPages = html.filter((p) => !isHome(p) && placeTokens.some((t) => label(p).includes(t)) && /movers?|moving|packers?|relocation|storage|shifting/i.test(label(p)))
  const servicePages = html.filter((p) => !isHome(p) && serviceTokens.some((t) => label(p).includes(t)) && !areaPages.includes(p))

  const keyPages = new Set<string>()
  for (const p of html) if (isHome(p) || KEY_PATH.test(p.path) || areaPages.includes(p) || servicePages.includes(p)) keyPages.add(p.url)

  const address = discoverAddress(html)

  const targetUrl = input.audit.targetUrl
  const targetPage = targetUrl ? (lookup.get(targetUrl.replace(/\/+$/, "")) ?? lookup.get(targetUrl) ?? html.find((p) => p.url.replace(/\/+$/, "") === targetUrl.replace(/\/+$/, ""))) : home

  return {
    crawl,
    client,
    input: input.audit,
    lighthouse: input.lighthouse,
    crux: input.crux,
    pages,
    html,
    home,
    arabic,
    english,
    servicePages,
    areaPages,
    keyPages,
    lookup,
    address,
    isServiceArea: address.found === null,
    targetPage,
  }
}

/** Same page, ignoring scheme, www and a trailing slash. */
export const sameUrl = (a: string, b: string) => {
  const bare = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase()
  return bare(a) === bare(b)
}

/** Mobile Lighthouse run for the homepage: what the original speed checks were built on. */
export const homeMobile = (ctx: Ctx) => ctx.lighthouse.find((r) => r.device === "mobile" && ctx.home && sameUrl(r.url, ctx.home.url))

export const config = AUDIT_CONFIG
