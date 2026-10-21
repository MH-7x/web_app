import { config, notChecked, pageCheck, pass, plural, short, siteCheck, warn, fail, type CheckDef, type Ctx } from "@/lib/audit/checks/util"
import type { LinkCheck } from "@/lib/audit/crawl-types"
import { normalizeUrl, stripWww } from "@/lib/audit/crawler"

const GENERIC = /^(click here|here|read more|learn more|more|link|this|this link|details|view|see more|اضغط هنا|هنا|المزيد|اقرأ المزيد|تفاصيل)$/i

const isInternal = (ctx: Ctx, href: string) => {
  try {
    return stripWww(new URL(href).hostname) === stripWww(new URL(ctx.crawl.origin).hostname)
  } catch {
    return false
  }
}

/** A link is broken when it errors out, is gone (404/410) or the server fails (5xx). 401/403/429 usually mean bot blocking, not a dead link. */
const isBroken = (l: LinkCheck) => l.status === 0 || l.status === 404 || l.status === 410 || l.status >= 500

const statusLabel = (l: LinkCheck) => {
  if (l.status) return `HTTP ${l.status}`
  return l.kind === "timeout" ? "timeout" : l.kind === "dns" ? "DNS failure" : l.message || "no response"
}

function brokenLinks(ctx: Ctx, internal: boolean) {
  const out: string[] = []
  for (const [url, l] of Object.entries(ctx.crawl.linkChecks)) {
    if (l.internal !== internal || !isBroken(l)) continue
    const src = l.sources[0]
    out.push(`${url} (${statusLabel(l)})${src ? ` on ${src.page}${src.text ? ` — anchor "${short(src.text, 40)}"` : ""}` : ""}`)
  }
  if (internal) {
    // crawled pages that answered with an error are broken internal links too; find who links to them
    for (const p of ctx.pages) {
      if (!(p.status === 404 || p.status === 410 || p.status >= 500)) continue
      let source = ""
      for (const q of ctx.html) {
        const hit = q.raw!.links.find((l) => normalizeUrl(l.href) === p.url || normalizeUrl(l.href) === normalizeUrl(p.requestedUrl))
        if (hit) {
          source = ` on ${q.path}${hit.text ? ` — anchor "${short(hit.text, 40)}"` : ""}`
          break
        }
      }
      out.push(`${p.url} (HTTP ${p.status})${source}`)
    }
  }
  return [...new Set(out)]
}

function linkCounts(ctx: Ctx) {
  let internal = 0
  let externalFollow = 0
  let externalNofollow = 0
  for (const p of ctx.html) {
    const seen = new Set<string>()
    for (const l of p.raw!.links) {
      const n = normalizeUrl(l.href)
      if (!n || seen.has(n)) continue
      seen.add(n)
      if (isInternal(ctx, n)) internal++
      else if (/nofollow|sponsored|ugc/.test(l.rel)) externalNofollow++
      else externalFollow++
    }
  }
  return { internal, externalFollow, externalNofollow, total: internal + externalFollow + externalNofollow }
}

export const checks: CheckDef[] = [
  siteCheck({
    id: "broken-internal",
    group: "links",
    name: "No broken internal links",
    severity: "critical",
    fix: "Update the links, or redirect the removed URLs.",
    run: (ctx) => {
      const urls = brokenLinks(ctx, true)
      const checked = Object.values(ctx.crawl.linkChecks).filter((l) => l.internal).length + ctx.pages.length
      return urls.length
        ? fail(plural(urls.length, "broken link"), "Links to pages that no longer exist waste crawl budget and send visitors to dead ends. Each entry shows the broken URL, the page it is on and the anchor text.", { urls, checked, failed: urls.length })
        : pass("None", `${plural(checked, "internal link")} checked: none broken.`, { checked, failed: 0 })
    },
  }),
  siteCheck({
    id: "broken-external",
    group: "links",
    name: "No broken external links",
    severity: "warning",
    fix: "Remove or replace the dead links.",
    run: (ctx) => {
      const urls = brokenLinks(ctx, false)
      const checked = Object.values(ctx.crawl.linkChecks).filter((l) => !l.internal).length
      return urls.length
        ? warn(plural(urls.length, "broken link"), "Outbound links that fail make the site look neglected. Each entry shows the dead URL, the page it is on and the anchor text.", { urls, checked, failed: urls.length })
        : pass("None", `${plural(checked, "external link")} checked: none broken. Sites that block bots (401, 403, 429) are not counted as broken.`, { checked, failed: 0 })
    },
  }),
  siteCheck({
    id: "link-stats",
    group: "links",
    name: "On-page link structure",
    severity: "info",
    run: (ctx) => {
      const c = linkCounts(ctx)
      if (!c.total) return pass("No links", "No links were found.", { checked: 0, failed: 0 })
      const pct = (n: number) => Math.round((n / c.total) * 100)
      const external = c.externalFollow + c.externalNofollow
      const ext = `${external} external (${pct(external)}%)`
      const nof = external ? `${c.externalNofollow} of those nofollow (${Math.round((c.externalNofollow / external) * 100)}% of external links)` : "no external links"
      return pass(`${c.internal} internal · ${ext}`, `${c.total} unique links across ${plural(ctx.html.length, "page")}: ${c.internal} internal, ${c.externalFollow} external follow, ${c.externalNofollow} external nofollow; ${nof}.`, { checked: c.total, failed: 0 })
    },
  }),
  pageCheck({
    id: "internal-links-count",
    group: "links",
    name: "Internal links per page",
    severity: "info",
    fix: "Link each page to related service and area pages (at least 3 internal links), and avoid pages with over 100.",
    test: (p, ctx) => {
      const n = new Set(p.raw!.links.map((l) => normalizeUrl(l.href)).filter((u): u is string => Boolean(u && isInternal(ctx, u) && u !== p.url))).size
      return { pass: n >= 3 && n <= 100, detail: `${p.path} (${n} internal links)` }
    },
    passMessage: "Every page links to 3 to 100 other pages on the site.",
    failMessage: "have too few (under 3) or too many (over 100) internal links.",
  }),
  pageCheck({
    id: "anchor-descriptive",
    group: "links",
    name: "Descriptive anchor text",
    severity: "info",
    fix: 'Replace "click here" and "read more" with words that describe the destination, such as "villa moving in Dubai".',
    test: (p) => {
      const bad = p.raw!.links.filter((l) => GENERIC.test(l.text.trim()))
      return { pass: bad.length === 0, detail: `${p.path} ("${bad[0]?.text ?? ""}"${bad.length > 1 ? ` ×${bad.length}` : ""})` }
    },
    passMessage: "No generic anchor text such as \"click here\".",
    failMessage: "use generic anchor text that tells search engines nothing about the destination.",
  }),
  pageCheck({
    id: "anchor-diversity",
    group: "links",
    name: "Anchor text variety",
    severity: "info",
    fix: "Vary the wording of links to the same page instead of repeating one phrase.",
    test: (p, ctx) => {
      const links = p.raw!.links.filter((l) => l.region === "main" && l.text && isInternal(ctx, l.href))
      if (links.length < 5) return null
      const unique = new Set(links.map((l) => l.text.toLowerCase())).size
      return { pass: unique / links.length >= 0.5, detail: `${p.path} (${unique} different anchors in ${links.length} links)` }
    },
    passMessage: "Internal links use varied anchor text.",
    failMessage: "repeat the same few anchor phrases across their internal links.",
  }),
  pageCheck({
    id: "friendly-urls",
    group: "links",
    name: "Readable, search-friendly URLs",
    severity: "info",
    fix: "Use short, lowercase, hyphenated words in URLs (for example /villa-movers-dubai) instead of IDs or parameters.",
    test: (p) => {
      const u = new URL(p.url)
      const problems: string[] = []
      if (u.search) problems.push("has query parameters")
      if (/[A-Z]/.test(decodeURIComponent(u.pathname)) && !/[؀-ۿ]/.test(u.pathname)) problems.push("uses capital letters")
      if (u.pathname.includes("_")) problems.push("uses underscores")
      if (/\d{6,}/.test(u.pathname)) problems.push("contains a long ID")
      if (u.pathname.length > 100) problems.push("is very long")
      return { pass: problems.length === 0, detail: `${p.path} ${problems.join(", ")}` }
    },
    passMessage: "URLs are readable and hyphenated.",
    failMessage: "have URLs that are hard for people and search engines to read.",
  }),
  pageCheck({
    id: "link-depth",
    group: "links",
    name: `Important pages within ${config.maxDepth} clicks of the homepage`,
    severity: "warning",
    fix: "Link deep pages from the homepage, a service hub or the main menu so they are fewer clicks away.",
    pages: (ctx) => ctx.html.filter((p) => ctx.keyPages.has(p.url) || p.inSitemap),
    test: (p) => (p.depth === null ? null : { pass: p.depth <= config.maxDepth, detail: `${p.path} (${p.depth} clicks)` }),
    summarize: (units) => ({ value: units.length ? `deepest ${Math.max(...units.map((u) => Number(/\((\d+) clicks\)/.exec(u.unit.detail ?? "")?.[1] ?? 0)))} clicks` : undefined }),
    passMessage: `Every important page is within ${config.maxDepth} clicks of the homepage.`,
    failMessage: `are more than ${config.maxDepth} clicks from the homepage, so they are crawled and valued less.`,
  }),
  siteCheck({
    id: "orphan-pages",
    group: "links",
    name: "No orphan pages",
    severity: "warning",
    fix: "Link each orphan page from a relevant service or area page, or from the menu.",
    run: (ctx) => {
      const s = ctx.crawl.sitemap
      if (!s?.valid) return notChecked("There is no valid sitemap to compare against, so orphan pages cannot be identified.")
      const crawledListed = ctx.pages.filter((p) => p.inSitemap && p !== ctx.home)
      const orphans = crawledListed.filter((p) => p.inlinks === 0)
      const unvisited = s.urls.length - ctx.pages.filter((p) => p.inSitemap).length
      const note = ctx.crawl.truncated ? ` The crawl limit was reached${unvisited > 0 ? `, so ${plural(unvisited, "sitemap URL")} could not be checked` : ""}.` : ""
      return orphans.length
        ? warn(plural(orphans.length, "orphan page"), `${plural(orphans.length, "page")} in the sitemap ${orphans.length === 1 ? "has" : "have"} no internal link pointing to ${orphans.length === 1 ? "it" : "them"}.${note}`, { urls: orphans.map((p) => p.path), checked: crawledListed.length, failed: orphans.length })
        : pass("None", `All ${plural(crawledListed.length, "sitemap page")} checked are linked from another page.${note}`, { checked: crawledListed.length, failed: 0 })
    },
  }),
  siteCheck({
    id: "links-backlinks",
    group: "links",
    name: "Backlink profile",
    severity: "warning",
    run: () =>
      notChecked(
        "Backlink data (total backlinks, referring domains, dofollow/nofollow, edu/gov links, domain strength, top anchors, pages and countries) comes from a paid link index such as Ahrefs, Moz, Majestic or DataForSEO. None is connected, so nothing is reported rather than a misleading zero."
      ),
  }),
]
