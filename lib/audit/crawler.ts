import type { Browser, Page } from "puppeteer"

import { AUDIT_CONFIG } from "@/lib/audit/config"
import type { CrawledPage, CrawlResult, LinkCheck, SitemapData } from "@/lib/audit/crawl-types"
import { extractPage } from "@/lib/audit/extract"
import { isPublicHost, safeFetch, traceRedirects, type Hop } from "@/lib/audit/net"
import { parseRobots } from "@/lib/audit/robots"
import { runProbes } from "@/lib/audit/site-probes"
import { minhash } from "@/lib/audit/text"
import type { CrawlError, CrawlErrorKind } from "@/lib/audit/types"

export type CrawlProgress = { phase: string; message: string; done: number; total: number }
type OnProgress = (p: CrawlProgress) => void

const PAGE_TIMEOUT_MS = 25_000
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|rar|mp4|mp3|docx?|xlsx?|pptx?|xml|json|txt|css|js|woff2?|ttf)$/i
const BLOCK_TEXT = /(access denied|attention required|just a moment|checking your browser|captcha|verify you are human|unusual traffic|request blocked|bot protection|you have been blocked)/i
const UA = "Mozilla/5.0 (compatible; UAEMarketingHubAudit/1.0)"

export const stripWww = (host: string) => host.replace(/^www\./i, "").toLowerCase()

/** One canonical form per page: no hash, no trailing slash (except the root), lowercase host. */
export function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const u = new URL(raw, base)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    u.hash = ""
    u.hostname = u.hostname.toLowerCase()
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "")
    return u.toString()
  } catch {
    return null
  }
}

/** Sort a Puppeteer navigation failure into something a person can act on. */
function classifyNavigation(error: unknown): { kind: CrawlErrorKind; message: string } {
  const m = error instanceof Error ? error.message : String(error)
  if (/timeout|timed out/i.test(m)) return { kind: "timeout", message: "The page took too long to load" }
  if (/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION/i.test(m)) return { kind: "dns", message: "The domain name could not be resolved (DNS failure)" }
  if (/ERR_CERT|ERR_SSL|certificate/i.test(m)) return { kind: "network", message: "TLS/certificate problem" }
  if (/ERR_CONNECTION_(REFUSED|RESET|CLOSED)|ERR_EMPTY_RESPONSE|ERR_ABORTED/i.test(m)) return { kind: "network", message: m.replace(/^.*net::/, "net::").slice(0, 120) }
  return { kind: "other", message: m.slice(0, 160) }
}

/* ------------------------------------------------------------ robots + sitemap */

const decodeXml = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")

async function readSitemapFile(url: string) {
  try {
    const res = await safeFetch(url, { timeoutMs: 12_000 })
    if (!res.ok) return { url, status: res.status, valid: false, locs: [] as string[], isIndex: false }
    const xml = (await res.text()).slice(0, 5_000_000)
    const isHtml = /^\s*<(!doctype html|html)/i.test(xml)
    const isIndex = /<sitemapindex/i.test(xml)
    const valid = !isHtml && /<(urlset|sitemapindex)/i.test(xml)
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => decodeXml(m[1]))
    return { url, status: res.status, valid, locs, isIndex }
  } catch {
    return { url, status: 0, valid: false, locs: [] as string[], isIndex: false }
  }
}

/** Tries the sitemaps robots.txt names, then the usual locations; the first valid one wins. Follows a sitemap index into its children. */
async function loadSitemap(origin: string, declared: string[]): Promise<SitemapData | null> {
  const candidates = [...new Set([...declared, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`])].slice(0, 4)
  let first: Awaited<ReturnType<typeof readSitemapFile>> | null = null
  let declaredBroken = false

  for (const url of candidates) {
    const file = await readSitemapFile(url)
    first ??= file
    if (declared.includes(url) && !file.valid) declaredBroken = true
    if (!file.valid) continue

    let urls = file.locs
    let children = 0
    if (file.isIndex) {
      children = file.locs.length
      urls = []
      for (const child of file.locs.slice(0, 8)) {
        const c = await readSitemapFile(child)
        if (c.valid && !c.isIndex) urls.push(...c.locs)
        if (urls.length >= 5000) break
      }
    }
    const normalised = [...new Set(urls.map((u) => normalizeUrl(u)).filter((u): u is string => Boolean(u)))].slice(0, 5000)
    return { url, status: file.status, valid: true, declaredBroken, urls: normalised, urlCount: normalised.length, children }
  }
  return first ? { url: first.url, status: first.status, valid: false, declaredBroken, urls: [], urlCount: 0, children: 0 } : null
}

/* ---------------------------------------------------------------- link checks */

async function checkLinks(
  targets: { href: string; internal: boolean }[],
  sources: Map<string, { page: string; text: string }[]>,
  onProgress: OnProgress
): Promise<Record<string, LinkCheck>> {
  const results: Record<string, LinkCheck> = {}
  let done = 0
  let next = 0

  async function worker() {
    while (next < targets.length) {
      const t = targets[next++]
      const trace = await traceRedirects(t.href, { method: "HEAD", timeoutMs: 9_000 })
      results[t.href] = {
        status: trace.error ? 0 : trace.finalStatus,
        kind: trace.error?.kind ?? (trace.loop ? "other" : null),
        message: trace.error?.message ?? (trace.loop ? "Redirect loop" : ""),
        internal: t.internal,
        hops: trace.hops,
        sources: (sources.get(t.href) ?? []).slice(0, 5),
      }
      onProgress({ phase: "links", message: `Checking links (${++done} of ${targets.length})`, done, total: targets.length })
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  return results
}

/* --------------------------------------------------------------------- crawl */

/**
 * Crawl a site from its homepage, breadth-first, staying on its own host; sitemap URLs that no link led to are visited
 * afterwards. Every page is read in a real browser, then links, redirects, robots.txt, the sitemap and a set of
 * site-wide probes are collected for the checks to work from.
 */
export async function crawlSite(browser: Browser, startUrl: string, opts: { maxPages?: number; onProgress: OnProgress; isCancelled?: () => boolean }): Promise<CrawlResult> {
  const { onProgress } = opts
  const maxPages = opts.maxPages ?? AUDIT_CONFIG.maxPages
  const start = normalizeUrl(startUrl)!
  const origin = new URL(start).origin
  const siteHost = stripWww(new URL(start).hostname)
  const errors: CrawlError[] = []
  const sameSite = (u: string) => {
    try {
      return stripWww(new URL(u).hostname) === siteHost
    } catch {
      return false
    }
  }

  onProgress({ phase: "robots", message: "Reading robots.txt, llms.txt and sitemap.xml", done: 0, total: 1 })
  const [robotsRes, llmsRes] = await Promise.all([
    safeFetch(`${origin}/robots.txt`, { timeoutMs: 8_000 }).then(async (r) => ({ status: r.status, text: r.ok ? (await r.text()).slice(0, 300_000) : "" })).catch(() => null),
    safeFetch(`${origin}/llms.txt`, { timeoutMs: 8_000 })
      .then(async (r) => ({ url: `${origin}/llms.txt`, status: r.status, ok: r.ok && !/html/i.test(r.headers.get("content-type") ?? "") && (await r.text()).trim().length > 0 }))
      .catch(() => null),
  ])
  const robots = robotsRes ? { ...robotsRes, rules: parseRobots(robotsRes.text) } : null
  const sitemap = await loadSitemap(origin, robots?.rules.sitemaps ?? [])
  const sitemapSet = new Set(sitemap?.urls ?? [])

  /* ---- pages ---- */
  const main: string[] = [start]
  const seeds: string[] = (sitemap?.urls ?? []).filter((u) => sameSite(u) && !SKIP_EXT.test(new URL(u).pathname) && u !== start)
  const seen = new Set<string>([start, ...seeds])
  const pages: CrawledPage[] = []
  const byFinal = new Set<string>()
  const linkSources = new Map<string, { page: string; text: string }[]>()
  const variants = new Map<string, Set<string>>()
  const paramUrls = new Set<string>()
  let started = 0
  let active = 0
  let truncated = false

  function addPage(page: Page, requestedUrl: string, finalUrl: string, status: number, headers: Record<string, string>, redirectChain: Hop[], raw: CrawledPage["raw"]) {
    const url = normalizeUrl(finalUrl) ?? finalUrl
    if (byFinal.has(url)) return
    byFinal.add(url)
    seen.add(url)
    const u = new URL(url)
    pages.push({
      url,
      requestedUrl,
      path: u.pathname + u.search || "/",
      status,
      redirectChain,
      headers,
      raw,
      minhash: raw ? minhash(raw.mainText) : null,
      inSitemap: sitemapSet.has(url) || sitemapSet.has(requestedUrl),
      inlinks: 0,
      depth: null,
    })
  }

  async function visit(page: Page, url: string) {
    onProgress({ phase: "crawl", message: `Crawling ${new URL(url).pathname || "/"}`, done: pages.length, total: Math.min(maxPages, started + main.length + seeds.length) })
    let response
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS })
    } catch (e) {
      const c = classifyNavigation(e)
      errors.push({ url, kind: c.kind, status: 0, message: c.message })
      return
    }
    const status = response?.status() ?? 0
    const finalUrl = page.url()
    const headers = Object.fromEntries(Object.entries(response?.headers() ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
    const chain: Hop[] = (response?.request().redirectChain() ?? []).map((r) => ({ url: r.url(), status: r.response()?.status() ?? 0 }))
    chain.push({ url: finalUrl, status })

    if (!(headers["content-type"] ?? "").includes("html")) {
      addPage(page, url, finalUrl, status, headers, chain, null)
      if (status >= 400) errors.push({ url, kind: "http", status, message: `HTTP ${status}` })
      return
    }

    await page.waitForNetworkIdle({ idleTime: 400, timeout: 4_000 }).catch(() => {})
    let raw
    try {
      raw = await page.evaluate(extractPage, { viewportH: 800 })
    } catch (e) {
      errors.push({ url, kind: "other", status, message: `Could not read the page (${e instanceof Error ? e.message.slice(0, 80) : "error"})` })
      return
    }

    if (status === 401 || status === 403 || status === 429 || status === 503 || status === 999 || (raw.bodyText.length < 1500 && BLOCK_TEXT.test(raw.bodyText))) {
      errors.push({ url, kind: "blocked", status, message: `The site refused the crawler (HTTP ${status}${BLOCK_TEXT.test(raw.bodyText) ? ", bot-protection page" : ""})` })
    } else if (status >= 400) {
      errors.push({ url, kind: "http", status, message: `HTTP ${status}` })
    }

    addPage(page, url, finalUrl, status, headers, chain, raw)

    for (const l of raw.links) {
      const n = normalizeUrl(l.href)
      if (!n) continue
      const internal = sameSite(n)
      const list = linkSources.get(n) ?? []
      if (list.length < 5) list.push({ page: new URL(page.url()).pathname || "/", text: l.text })
      linkSources.set(n, list)
      if (!internal) continue

      const form = l.href.split("#")[0]
      const key = form.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase()
      const set = variants.get(key) ?? new Set<string>()
      if (set.size < 6) set.add(form)
      variants.set(key, set)

      if (SKIP_EXT.test(new URL(n).pathname)) continue
      if (new URL(n).search) {
        if (paramUrls.size < 60) paramUrls.add(n)
        continue
      }
      if (!seen.has(n)) {
        seen.add(n)
        main.push(n)
      }
    }
  }

  async function worker() {
    const page = await browser.newPage()
    await page.setUserAgent(UA)
    await page.setViewport({ width: 1366, height: 800 })
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      const type = req.resourceType()
      // fonts and media are never needed; images only on the first few pages, so image checks have real sizes without slowing the whole crawl
      if (type === "font" || type === "media" || (type === "image" && started > AUDIT_CONFIG.imagePages)) return void req.abort()
      let host = ""
      try {
        host = new URL(req.url()).hostname
      } catch {
        return void req.continue()
      }
      // never let a page pull the crawler onto a private address
      void isPublicHost(host).then((ok) => (ok ? req.continue() : req.abort()))
    })

    try {
      while (!opts.isCancelled?.()) {
        const url = main.shift() ?? seeds.shift()
        if (!url) {
          if (active === 0) break
          await new Promise((r) => setTimeout(r, 150)) // another tab may still add links
          continue
        }
        if (started >= maxPages) {
          truncated = true
          break
        }
        started++
        active++
        try {
          await visit(page, url)
        } finally {
          active--
        }
      }
    } finally {
      await page.close().catch(() => {})
    }
  }

  await Promise.all(Array.from({ length: AUDIT_CONFIG.workers }, worker))
  if (main.length > 0 || seeds.length > 0) truncated = true

  /* ---- link graph: inlinks and click depth ---- */
  const lookup = new Map<string, CrawledPage>()
  for (const p of pages) {
    lookup.set(p.url, p)
    const req = normalizeUrl(p.requestedUrl)
    if (req) lookup.set(req, p)
    for (const h of p.redirectChain) {
      const n = normalizeUrl(h.url)
      if (n && !lookup.has(n)) lookup.set(n, p)
    }
  }
  const inbound = new Map<CrawledPage, Set<CrawledPage>>()
  const graph = new Map<CrawledPage, Set<CrawledPage>>()
  for (const p of pages) {
    const out = new Set<CrawledPage>()
    for (const l of p.raw?.links ?? []) {
      const n = normalizeUrl(l.href)
      const target = n ? lookup.get(n) : undefined
      if (!target || target === p) continue
      out.add(target)
      const set = inbound.get(target) ?? new Set<CrawledPage>()
      set.add(p)
      inbound.set(target, set)
    }
    graph.set(p, out)
  }
  for (const p of pages) p.inlinks = inbound.get(p)?.size ?? 0

  const home = lookup.get(start) ?? pages[0]
  if (home) {
    home.depth = 0
    const queue = [home]
    while (queue.length) {
      const p = queue.shift()!
      for (const t of graph.get(p) ?? []) {
        if (t.depth === null) {
          t.depth = (p.depth ?? 0) + 1
          queue.push(t)
        }
      }
    }
  }

  /* ---- links that were not crawled ---- */
  const crawled = new Set(lookup.keys())
  const internalTargets: { href: string; internal: boolean }[] = []
  const externalTargets: { href: string; internal: boolean }[] = []
  for (const href of linkSources.keys()) {
    if (crawled.has(href) || SKIP_EXT.test(new URL(href).pathname)) continue
    ;(sameSite(href) ? internalTargets : externalTargets).push({ href, internal: sameSite(href) })
  }
  // internal pages beyond the crawl budget (and parameter URLs) still get their status checked
  const targets = [...internalTargets.slice(0, AUDIT_CONFIG.maxInternalLinkChecks), ...externalTargets.slice(0, AUDIT_CONFIG.maxExternalLinkChecks)]
  const linkChecks = opts.isCancelled?.() ? {} : await checkLinks(targets, linkSources, onProgress)

  /* ---- site-wide probes ---- */
  onProgress({ phase: "probes", message: "Checking redirects, security headers, DNS and images", done: 0, total: 1 })
  const probes = await runProbes({ origin, startUrl: start, pages, onProgress })

  /* ---- blocked detection ---- */
  const attempted = started
  const blockedCount = errors.filter((e) => e.kind === "blocked").length
  const homeBlocked = errors.some((e) => e.kind === "blocked" && normalizeUrl(e.url) === start)
  const blocked = homeBlocked || (attempted >= 5 && blockedCount / attempted >= 0.2)

  return {
    origin,
    startUrl: start,
    pages,
    truncated,
    attempted,
    linkChecks,
    robots,
    llms: llmsRes,
    sitemap,
    probes,
    errors,
    linkVariants: [...variants.entries()].filter(([, s]) => s.size > 1).map(([key, s]) => ({ key, forms: [...s] })),
    paramUrls: [...paramUrls],
    blocked,
  }
}


