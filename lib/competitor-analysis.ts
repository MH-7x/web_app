import type { Browser, Page } from "puppeteer"

import { launchBrowser } from "@/lib/audit/browser"
import { extractPage, type RawExtract } from "@/lib/audit/extract"
import { assertPublicUrl, isPublicHost, safeFetch } from "@/lib/audit/net"
import { isAllowed, parseRobots } from "@/lib/audit/robots"
import { arabicRatio, fleschReadingEase, words } from "@/lib/audit/text"
import { COMPETITOR_CACHE_DAYS, summarize, type CompetitorPage, type CompetitorSummary } from "@/lib/competitor-types"
import { asRecord } from "@/lib/client-schema"
import { db } from "@/lib/db"

const UA = "Mozilla/5.0 (compatible; UAEMarketingHubAudit/1.0)"
const ROBOTS_AGENT = "UAEMarketingHubAudit"
const PAGE_TIMEOUT_MS = 25_000
const MAX_TEXT = 20_000
const BLOCK_TEXT = /(access denied|attention required|just a moment|checking your browser|captcha|verify you are human|unusual traffic|request blocked|bot protection|you have been blocked)/i
const PROCESS_HEADING = /how it works|our process|the process|process|step[- ]by[- ]step|steps|what to expect|how we (work|move|do)|from .* to |خطوات|كيف (نعمل|تعمل|يتم)|مراحل|آلية|طريقة (العمل|عملنا)/i

export type CompetitorError = { url: string; message: string }

/* ------------------------------------------------------------------- derive */

function derive(url: string, finalUrl: string, status: number, raw: RawExtract): CompetitorPage {
  const text = raw.mainText.slice(0, MAX_TEXT)
  const outline = raw.headings
    .filter((h) => (h.level === 2 || h.level === 3) && h.text)
    .slice(0, 60)
    .map((h) => ({ level: h.level as 2 | 3, text: h.text.slice(0, 160) }))
  const schemaQuestions = raw.schema.flatMap((s) => s.faqQuestions)
  const headingQuestions = outline.filter((o) => /[?؟]\s*$/.test(o.text)).map((o) => o.text)
  const faqQuestions = [...new Set([...schemaQuestions, ...headingQuestions])].slice(0, 12).map((q) => q.slice(0, 200))
  // tiny images are icons and tracking pixels, not content
  const content = raw.images.filter((i) => Math.max(i.rendered[0], i.natural[0]) >= 100)
  const lang = arabicRatio(text) >= 0.4 ? "ar" : "en"

  return {
    url,
    finalUrl,
    fetchedAt: new Date().toISOString(),
    status,
    language: lang,
    title: raw.title.slice(0, 200),
    metaDescription: raw.metaDescription.slice(0, 400),
    h1: (raw.headings.find((h) => h.level === 1)?.text ?? "").slice(0, 200),
    outline,
    wordCount: words(text).length,
    faqQuestions,
    hasFaq: raw.faq.headingFound || faqQuestions.length > 0 || raw.faq.items > 2,
    hasProcess: outline.some((o) => PROCESS_HEADING.test(o.text)),
    schemaTypes: [...new Set(raw.schema.flatMap((s) => s.types))].slice(0, 12),
    ctas: { tel: raw.cta.tel || raw.telLinks.length > 0, whatsapp: raw.cta.whatsapp || raw.waLinks.length > 0, form: raw.cta.form },
    hasReviews: raw.hasVisibleReviews || raw.schema.some((s) => s.aggregateRating || s.hasReview),
    hasMap: raw.mapEmbeds > 0,
    images: {
      count: content.length,
      withAlt: content.filter((i) => (i.alt ?? "").trim()).length,
      altSamples: content.map((i) => (i.alt ?? "").trim()).filter(Boolean).slice(0, 5).map((a) => a.slice(0, 120)),
    },
    readingEase: lang === "en" ? fleschReadingEase(text) : null,
    text,
  }
}

/* -------------------------------------------------------------------- crawl */

async function readPage(browser: Browser, url: string): Promise<CompetitorPage> {
  // robots.txt: a page the site asks crawlers to stay out of is not read
  const origin = new URL(url).origin
  const robots = await safeFetch(`${origin}/robots.txt`, { timeoutMs: 8_000, headers: { "user-agent": UA } })
    .then(async (r) => (r.ok ? parseRobots((await r.text()).slice(0, 300_000)) : null))
    .catch(() => null)
  const path = new URL(url).pathname + new URL(url).search
  if (robots && !isAllowed(robots, ROBOTS_AGENT, path)) throw new Error("The site's robots.txt asks crawlers not to read this page")

  const page: Page = await browser.newPage()
  try {
    await page.setUserAgent(UA)
    await page.setViewport({ width: 1366, height: 800 })
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      const type = req.resourceType()
      // only the page's own markup is needed: no images, fonts or media
      if (type === "image" || type === "font" || type === "media") return void req.abort()
      let host = ""
      try {
        host = new URL(req.url()).hostname
      } catch {
        return void req.continue()
      }
      // never let a page pull the crawler onto a private address
      void isPublicHost(host).then((ok) => (ok ? req.continue() : req.abort()))
    })

    let response
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS })
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      throw new Error(/timeout/i.test(m) ? "The page took too long to load" : /ERR_NAME_NOT_RESOLVED/i.test(m) ? "The domain name could not be resolved" : "The page could not be loaded")
    }
    const status = response?.status() ?? 0
    if (!(response?.headers()["content-type"] ?? "").includes("html")) throw new Error("That address is not a web page")
    await page.waitForNetworkIdle({ idleTime: 400, timeout: 4_000 }).catch(() => {})
    const raw = await page.evaluate(extractPage, { viewportH: 800 })

    if (status >= 400 || (raw.bodyText.length < 1500 && BLOCK_TEXT.test(raw.bodyText))) {
      throw new Error(status >= 400 ? `The site answered HTTP ${status}` : "The site refused the crawler (bot-protection page)")
    }
    if (words(raw.mainText).length < 50) throw new Error("The page has almost no readable text (it may need JavaScript the crawler could not run)")
    return derive(url, page.url(), status, raw)
  } finally {
    await page.close().catch(() => {})
  }
}

/** The cached copy of a page, if it is fresh enough. */
async function cached(url: string): Promise<CompetitorPage | null> {
  const row = await db.competitorPage.findUnique({ where: { url } })
  if (!row || Date.now() - row.fetchedAt.getTime() > COMPETITOR_CACHE_DAYS * 86_400_000) return null
  try {
    const data = asRecord(JSON.parse(row.data)) as unknown as CompetitorPage
    return data && Array.isArray(data.outline) ? { ...data, fetchedAt: row.fetchedAt.toISOString() } : null
  } catch {
    return null
  }
}

async function store(page: CompetitorPage) {
  const data = JSON.stringify(page)
  const fetchedAt = new Date(page.fetchedAt)
  await db.competitorPage.upsert({ where: { url: page.url }, create: { url: page.url, data, fetchedAt }, update: { data, fetchedAt } })
}

/**
 * Read each competitor page (from the 30-day cache when it is fresh and `refresh` is off). A page that cannot be read
 * is reported in `errors` and left out; the rest still come back.
 */
export async function readCompetitors(urls: string[], { refresh }: { refresh: boolean }) {
  const found = new Map<string, { page: CompetitorPage; cached: boolean }>()
  const errors: CompetitorError[] = []
  const toCrawl: string[] = []

  for (const url of urls) {
    try {
      await assertPublicUrl(url)
    } catch (e) {
      errors.push({ url, message: e instanceof Error ? e.message : "Not a public website" })
      continue
    }
    const hit = refresh ? null : await cached(url)
    if (hit) found.set(url, { page: hit, cached: true })
    else toCrawl.push(url)
  }

  if (toCrawl.length) {
    let browser: Browser | undefined
    try {
      browser = await launchBrowser()
      let next = 0
      const worker = async () => {
        while (next < toCrawl.length) {
          const url = toCrawl[next++]
          try {
            const page = await readPage(browser!, url)
            await store(page)
            found.set(url, { page, cached: false })
          } catch (e) {
            errors.push({ url, message: e instanceof Error ? e.message : "The page could not be read" })
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, toCrawl.length) }, worker))
    } catch (e) {
      // no browser to drive: every page that still needed a crawl fails with the reason
      const message = e instanceof Error ? e.message : "The crawler could not start"
      for (const url of toCrawl) if (!found.has(url) && !errors.some((x) => x.url === url)) errors.push({ url, message })
    } finally {
      await browser?.close().catch(() => {})
    }
  }

  return { found, errors }
}

export async function analyzeCompetitors(urls: string[], keywords: { primary: string; secondary: string[] }, opts: { refresh: boolean }) {
  const { found, errors } = await readCompetitors(urls, opts)
  // two addresses can redirect to the same page; it should count once
  const seen = new Map<string, string>()
  const summaries: CompetitorSummary[] = urls.flatMap((url) => {
    const hit = found.get(url)
    if (!hit) return []
    const first = seen.get(hit.page.finalUrl)
    if (first) {
      errors.push({ url, message: `Redirects to the same page as ${first}, so it is counted once` })
      return []
    }
    seen.set(hit.page.finalUrl, url)
    return [summarize(hit.page, hit.cached, keywords.primary, keywords.secondary)]
  })
  return { summaries, errors }
}
