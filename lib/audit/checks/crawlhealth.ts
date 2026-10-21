import { fail, list, notChecked, pageCheck, pass, plural, short, siteCheck, warn, type CheckDef, type Ctx } from "@/lib/audit/checks/util"
import type { CrawledPage } from "@/lib/audit/crawl-types"
import { normalizeUrl } from "@/lib/audit/crawler"
import { isAllowed, SEARCH_BOTS } from "@/lib/audit/robots"

export const isNoindex = (p: CrawledPage) => Boolean(p.raw?.robotsMeta.includes("noindex") || (p.headers["x-robots-tag"] ?? "").toLowerCase().includes("noindex"))

const bare = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase()

const sameSite = (ctx: Ctx, url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === new URL(ctx.crawl.origin).hostname.replace(/^www\./, "")
  } catch {
    return false
  }
}

/** "A → B → C (301, 302, 200)" */
const chainText = (hops: { url: string; status: number }[]) => `${hops.map((h) => new URL(h.url).pathname || "/").join(" → ")} (${hops.map((h) => h.status).join(", ")})`

const rankKind = (kind: string) => ({ timeout: "Timeouts", dns: "DNS failures", blocked: "Blocked by the site", network: "Connection errors", http: "HTTP errors", other: "Other errors" })[kind] ?? kind

export const checks: CheckDef[] = [
  /* --------------------------------------------------------- crawl health */
  siteCheck({
    id: "crawl-blocked",
    group: "crawlHealth",
    name: "Crawler not blocked by the site",
    severity: "critical",
    fix: "Allow the audit crawler through the firewall or bot protection (Cloudflare, Sucuri, a security plugin), or run the audit from an allow-listed network. Until then the results below may be incomplete or wrong.",
    run: (ctx) => {
      const blocked = ctx.crawl.errors.filter((e) => e.kind === "blocked")
      if (ctx.crawl.blocked)
        return fail(`${plural(blocked.length, "blocked request")}`, "The site refused or challenged the crawler. Firewall or bot protection is interfering, so these results may be incomplete or inaccurate.", { urls: blocked.map((e) => `${e.url} (${e.message})`), checked: ctx.crawl.attempted, failed: blocked.length })
      return blocked.length
        ? warn(plural(blocked.length, "blocked request"), "A few requests were refused. Most of the site answered normally, but treat the missing pages with caution.", { urls: blocked.map((e) => `${e.url} (${e.message})`), checked: ctx.crawl.attempted, failed: blocked.length })
        : pass("No blocking detected", `The site answered ${plural(ctx.crawl.pages.length, "page")} without refusing the crawler.`, { checked: ctx.crawl.attempted, failed: 0 })
    },
  }),
  siteCheck({
    id: "crawl-errors",
    group: "crawlHealth",
    name: "Fetch errors during the crawl",
    severity: "warning",
    fix: "Check hosting stability and DNS. Repeated timeouts usually mean the server is slow or overloaded.",
    run: (ctx) => {
      const errs = ctx.crawl.errors.filter((e) => e.kind !== "blocked")
      if (!errs.length) return pass("None", "Every request completed.", { checked: ctx.crawl.attempted, failed: 0 })
      const groups = [...new Set(errs.map((e) => e.kind))].map((k) => ({ label: rankKind(k), urls: errs.filter((e) => e.kind === k).map((e) => `${e.url} (${e.message})`) }))
      return warn(`${errs.length} of ${ctx.crawl.attempted}`, `${plural(errs.length, "request")} failed: ${groups.map((g) => `${g.urls.length} ${g.label.toLowerCase()}`).join(", ")}.`, { groups, urls: errs.map((e) => e.url), checked: ctx.crawl.attempted, failed: errs.length })
    },
  }),
  pageCheck({
    id: "page-error",
    group: "crawlHealth",
    name: "Status code 200 on every page",
    severity: "critical",
    fix: "Fix the pages or redirect them to the closest live page.",
    pages: (ctx) => ctx.pages,
    test: (p) => ({ pass: p.status < 400, detail: p.status >= 400 ? `${p.path} (${p.status})` : p.path }),
    passMessage: "Every crawled URL answered successfully.",
    failMessage: "returned an error status (4xx or 5xx), so they cannot be indexed.",
  }),

  /* ------------------------------------------------------------- robots.txt */
  siteCheck({
    id: "robots-exists",
    group: "crawlHealth",
    name: "robots.txt exists",
    severity: "warning",
    fix: "Create /robots.txt that allows crawling and lists your sitemap.",
    run: (ctx) =>
      ctx.crawl.robots?.status === 200
        ? pass(`${ctx.crawl.origin}/robots.txt`, "robots.txt was found.", { checked: 1, failed: 0 })
        : warn(ctx.crawl.robots ? `HTTP ${ctx.crawl.robots.status}` : "Unreachable", "No robots.txt file was found. It tells crawlers what they may fetch and where the sitemap is.", { checked: 1, failed: 1 }),
  }),
  siteCheck({
    id: "robots-blocks-all",
    group: "crawlHealth",
    name: "robots.txt does not block the whole site",
    severity: "critical",
    fix: "Remove the blanket Disallow rule unless the site is deliberately private.",
    run: (ctx) => {
      if (ctx.crawl.robots?.status !== 200) return notChecked("There is no robots.txt to read.")
      return isAllowed(ctx.crawl.robots.rules, "*", "/")
        ? pass("Crawling allowed", "robots.txt does not block the site root.", { checked: 1, failed: 0 })
        : fail("Disallow: /", "robots.txt blocks all crawlers from the whole site, so it cannot rank.", { checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "robots-bots",
    group: "crawlHealth",
    name: "Major search engines allowed",
    severity: "critical",
    fix: "Remove the Disallow rules that name these search engines in robots.txt.",
    run: (ctx) => {
      const rules = ctx.crawl.robots?.status === 200 ? ctx.crawl.robots.rules : null
      if (!rules) return pass("All allowed", "There is no robots.txt, so every search engine is allowed by default.", { checked: SEARCH_BOTS.length, failed: 0 })
      const blocked = SEARCH_BOTS.filter((b) => !isAllowed(rules, b, "/"))
      return blocked.length
        ? fail(`Blocked: ${blocked.join(", ")}`, `robots.txt blocks ${list(blocked, 6)} from the site.`, { checked: SEARCH_BOTS.length, failed: blocked.length })
        : pass("All allowed", `${SEARCH_BOTS.join(", ")} are allowed.`, { checked: SEARCH_BOTS.length, failed: 0 })
    },
  }),
  siteCheck({
    id: "robots-assets",
    group: "crawlHealth",
    name: "CSS and JavaScript not blocked in robots.txt",
    severity: "warning",
    fix: "Remove Disallow rules for the folders that hold your CSS and JavaScript. Google needs them to render the page like a visitor sees it.",
    run: (ctx) => {
      const rules = ctx.crawl.robots?.status === 200 ? ctx.crawl.robots.rules : null
      if (!rules) return pass("No robots.txt", "Nothing is blocked.", { checked: 0, failed: 0 })
      const files = [...new Set(ctx.html.flatMap((p) => [...p.raw!.stylesheets.map((s) => s.href), ...p.raw!.scripts.map((s) => s.src)]).filter((u) => sameSite(ctx, u)))]
      const blocked = files.filter((u) => !isAllowed(rules, "Googlebot", new URL(u).pathname + new URL(u).search))
      if (!files.length) return pass("No local files", "The pages load no CSS or JavaScript from this site.", { checked: 0, failed: 0 })
      return blocked.length
        ? warn(`${blocked.length} of ${files.length} blocked`, "robots.txt stops Googlebot from fetching some CSS or JavaScript files the pages need.", { urls: blocked.slice(0, 25), checked: files.length, failed: blocked.length })
        : pass("Not blocked", `${plural(files.length, "CSS/JS file")} checked against robots.txt.`, { checked: files.length, failed: 0 })
    },
  }),

  /* ---------------------------------------------------------------- sitemap */
  siteCheck({
    id: "sitemap-exists",
    group: "crawlHealth",
    name: "XML sitemap exists",
    severity: "warning",
    fix: "Publish /sitemap.xml and submit it in Google Search Console.",
    run: (ctx) =>
      ctx.crawl.sitemap?.status === 200
        ? pass(ctx.crawl.sitemap.url, "A sitemap was found.", { checked: 1, failed: 0 })
        : warn("Not found", "No XML sitemap was found. It helps Google discover every page, especially new service and area pages.", { checked: 1, failed: 1 }),
  }),
  siteCheck({
    id: "sitemap-valid",
    group: "crawlHealth",
    name: "Sitemap is valid and lists URLs",
    severity: "warning",
    fix: "Regenerate it so it lists every indexable page.",
    run: (ctx) => {
      const s = ctx.crawl.sitemap
      if (!s || s.status !== 200) return notChecked("There is no sitemap to read.")
      return s.valid && s.urlCount > 0
        ? pass(`${s.urlCount} URLs`, `The sitemap is valid XML and lists ${plural(s.urlCount, "URL")}${s.children ? ` across ${plural(s.children, "sitemap file")}` : ""}.`, { checked: 1, failed: 0 })
        : warn("Empty or invalid", "The sitemap was found but contains no readable URLs.", { urls: [s.url], checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "sitemap-declared",
    group: "crawlHealth",
    name: "Sitemap named in robots.txt is valid",
    severity: "warning",
    fix: "Correct the Sitemap: line in robots.txt to the real sitemap URL.",
    run: (ctx) => {
      const declared = ctx.crawl.robots?.status === 200 ? ctx.crawl.robots.rules.sitemaps : []
      if (!declared.length) return notChecked("robots.txt does not name a sitemap.")
      return ctx.crawl.sitemap?.declaredBroken
        ? warn("Broken", "robots.txt points to a sitemap address that does not return a sitemap, so crawlers that follow it find nothing.", { urls: declared, checked: 1, failed: 1 })
        : pass("Valid", "The sitemap named in robots.txt is valid.", { checked: 1, failed: 0 })
    },
  }),
  siteCheck({
    id: "sitemap-in-robots",
    group: "crawlHealth",
    name: "Sitemap referenced in robots.txt",
    severity: "info",
    fix: "Add a line such as Sitemap: https://example.com/sitemap.xml to robots.txt.",
    run: (ctx) => {
      if (ctx.crawl.robots?.status !== 200) return notChecked("There is no robots.txt to read.")
      const n = ctx.crawl.robots.rules.sitemaps.length
      return n ? pass(`${n} listed`, "robots.txt lists a sitemap.", { checked: 1, failed: 0 }) : warn("Not listed", "Listing the sitemap in robots.txt lets every crawler find it without a manual submission.", { checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "sitemap-consistency",
    group: "crawlHealth",
    name: "Sitemap matches the crawl",
    severity: "warning",
    fix: "Keep only live, indexable, canonical 200 pages in the sitemap, and add any indexable page that is missing.",
    run: (ctx) => {
      const s = ctx.crawl.sitemap
      if (!s?.valid) return notChecked("There is no valid sitemap to compare against.")
      const listed = ctx.pages.filter((p) => p.inSitemap)
      const nonOk = listed.filter((p) => p.status !== 200)
      const redirected = listed.filter((p) => p.status === 200 && normalizeUrl(p.requestedUrl) !== p.url)
      const noindexed = listed.filter((p) => isNoindex(p))
      const elsewhere = listed.filter((p) => p.raw && p.raw.canonicals[0] && bare(p.raw.canonicals[0]) !== bare(p.url))
      const sitemapSet = new Set(s.urls)
      const missing = ctx.html.filter((p) => !p.inSitemap && !sitemapSet.has(p.url) && p.status === 200 && !isNoindex(p) && (!p.raw!.canonicals[0] || bare(p.raw!.canonicals[0]) === bare(p.url)))
      const groups = [
        { label: "Sitemap URLs that do not return 200", urls: nonOk.map((p) => `${p.path} (${p.status})`) },
        { label: "Sitemap URLs that redirect", urls: redirected.map((p) => `${new URL(p.requestedUrl).pathname} → ${p.path}`) },
        { label: "Sitemap URLs set to noindex", urls: noindexed.map((p) => p.path) },
        { label: "Sitemap URLs whose canonical points elsewhere", urls: elsewhere.map((p) => p.path) },
        { label: "Indexable pages missing from the sitemap", urls: missing.map((p) => p.path) },
      ].filter((g) => g.urls.length)
      const unchecked = s.urls.length - listed.length
      const note = unchecked > 0 ? ` ${plural(unchecked, "sitemap URL")} could not be visited within the crawl limit.` : ""
      return groups.length
        ? warn(plural(groups.reduce((n, g) => n + g.urls.length, 0), "mismatch", "mismatches"), `The sitemap and the live site disagree.${note}`, { groups, urls: groups.flatMap((g) => g.urls), checked: listed.length + missing.length, failed: groups.reduce((n, g) => n + g.urls.length, 0) })
        : pass("Consistent", `${plural(listed.length, "sitemap URL")} checked: all return 200, are indexable and canonical.${note}`, { checked: listed.length, failed: 0 })
    },
  }),

  /* ------------------------------------------------------------ canonicals */
  pageCheck({
    id: "canonical-missing",
    group: "crawlHealth",
    name: "Canonical tag present",
    severity: "warning",
    fix: 'Add a self-referencing <link rel="canonical"> to every page.',
    test: (p) => ({ pass: p.raw!.canonicals.length > 0, detail: p.path }),
    passMessage: "Every page declares a canonical URL.",
    failMessage: "have no canonical tag, so URL variations can be indexed as duplicates.",
  }),
  pageCheck({
    id: "canonical-other",
    group: "crawlHealth",
    name: "Canonical points to the page itself",
    severity: "warning",
    fix: "Make each page's canonical itself, unless it is a deliberate duplicate.",
    test: (p) => {
      const c = p.raw!.canonicals[0]
      return c ? { pass: bare(c) === bare(p.url), detail: `${p.path} → ${c}` } : null
    },
    passMessage: "Canonicals are self-referencing.",
    failMessage: "have a canonical pointing at a different URL, so Google may drop them from the index.",
  }),
  pageCheck({
    id: "canonical-multiple",
    group: "crawlHealth",
    name: "One canonical per page",
    severity: "warning",
    fix: "Keep a single canonical tag. SEO plugins and themes often both add one.",
    test: (p) => {
      const c = p.raw!.canonicals
      return c.length ? { pass: new Set(c.map(bare)).size <= 1 && c.length === 1, detail: `${p.path} (${c.length} tags)` } : null
    },
    passMessage: "Every page has a single canonical tag.",
    failMessage: "declare more than one canonical tag, which Google may ignore.",
  }),
  pageCheck({
    id: "canonical-target",
    group: "crawlHealth",
    name: "Canonical target is a live page",
    severity: "warning",
    fix: "Point the canonical at a page that returns 200 directly, not at a redirect or an error page.",
    test: (p, ctx) => {
      const c = p.raw!.canonicals[0]
      if (!c) return null
      const target = ctx.lookup.get(normalizeUrl(c) ?? "")
      if (!target || target === p) return null
      const bad = target.status !== 200 || target.redirectChain.length > 1
      return { pass: !bad, detail: `${p.path} → ${target.path} (${target.status}${target.redirectChain.length > 1 ? ", redirects" : ""})` }
    },
    passMessage: "Canonical targets are live pages.",
    failMessage: "have a canonical that points to a page that errors or redirects.",
  }),
  pageCheck({
    id: "canonical-noindex",
    group: "crawlHealth",
    name: "Canonical and noindex do not conflict",
    severity: "warning",
    fix: "Pick one signal: a noindex page should not canonicalise to another URL, and a canonical should not point at a noindexed page.",
    test: (p, ctx) => {
      const c = p.raw!.canonicals[0]
      const target = c ? ctx.lookup.get(normalizeUrl(c) ?? "") : undefined
      const selfNoindexWithOther = isNoindex(p) && c && bare(c) !== bare(p.url)
      const targetNoindex = target && target !== p && isNoindex(target)
      return c || isNoindex(p) ? { pass: !selfNoindexWithOther && !targetNoindex, detail: `${p.path}${selfNoindexWithOther ? " is noindex but canonicalises elsewhere" : " canonicalises to a noindexed page"}` } : null
    },
    passMessage: "No page sends contradictory canonical and noindex signals.",
    failMessage: "send contradictory canonical and noindex signals.",
  }),
  pageCheck({
    id: "noindex",
    group: "crawlHealth",
    name: "Page is indexable (no noindex)",
    severity: "critical",
    fix: "Remove the noindex directive from any page that should rank.",
    // a noindex on an author, tag or search archive is usually deliberate; on a page in the sitemap or a key page it is almost certainly a mistake
    test: (p, ctx) => ({ pass: !isNoindex(p), severity: ctx.keyPages.has(p.url) || p.inSitemap ? "critical" : "warning", detail: `${p.path} (${(p.headers["x-robots-tag"] ?? "").toLowerCase().includes("noindex") ? "X-Robots-Tag header" : "meta robots"})` }),
    passMessage: "No page tells search engines to stay away.",
    failMessage: "are set to noindex, so Google keeps them out of results.",
  }),

  /* ------------------------------------------------------------- redirects */
  siteCheck({
    id: "redirect-chains",
    group: "crawlHealth",
    name: "No redirect chains",
    severity: "warning",
    fix: "Point every link and redirect straight at the final URL so there is only ever one hop.",
    run: (ctx) => {
      const chains = [
        ...ctx.pages.filter((p) => p.redirectChain.length > 2).map((p) => ({ hops: p.redirectChain, from: "crawl" })),
        // only the site's own redirects: what other sites do with their URLs is not this client's to fix
        ...Object.values(ctx.crawl.linkChecks).filter((l) => l.internal && l.hops.length > 2 && l.kind !== "other").map((l) => ({ hops: l.hops, from: "link" })),
      ]
      const unique = [...new Map(chains.map((c) => [c.hops[0].url, c])).values()]
      return unique.length
        ? warn(plural(unique.length, "chain"), `${plural(unique.length, "redirect chain")} ${unique.length === 1 ? "takes" : "take"} more than one hop to reach the final page, which slows visitors and wastes crawl budget.`, { urls: unique.map((c) => chainText(c.hops)), checked: unique.length, failed: unique.length })
        : pass("None", "No URL needs more than one redirect.", { checked: ctx.pages.length, failed: 0 })
    },
  }),
  siteCheck({
    id: "redirect-loops",
    group: "crawlHealth",
    name: "No redirect loops",
    severity: "critical",
    fix: "Break the loop: one of the redirects sends visitors back to a URL that redirects again.",
    run: (ctx) => {
      const loops = Object.entries(ctx.crawl.linkChecks).filter(([, l]) => l.internal && l.message === "Redirect loop")
      return loops.length
        ? fail(plural(loops.length, "loop"), "These URLs redirect in a circle and never reach a page.", { urls: loops.map(([u, l]) => `${u} (${l.hops.length} hops)`), checked: loops.length, failed: loops.length })
        : pass("None", "No redirect loops were found.", { checked: Object.keys(ctx.crawl.linkChecks).length, failed: 0 })
    },
  }),
  siteCheck({
    id: "redirect-temporary",
    group: "crawlHealth",
    name: "Permanent redirects use 301",
    severity: "warning",
    fix: "Change temporary (302/303/307) redirects to 301 unless the move really is temporary.",
    run: (ctx) => {
      const temp: string[] = []
      for (const p of ctx.pages) for (const h of p.redirectChain.slice(0, -1)) if ([302, 303, 307].includes(h.status) && sameSite(ctx, h.url)) temp.push(`${new URL(h.url).pathname || "/"} (${h.status}) on ${p.path}`)
      for (const [u, l] of Object.entries(ctx.crawl.linkChecks).filter(([, x]) => x.internal)) for (const h of l.hops.slice(0, -1)) if ([302, 303, 307].includes(h.status) && sameSite(ctx, h.url)) temp.push(`${new URL(u).pathname || "/"} (${h.status})`)
      const urls = [...new Set(temp)]
      return urls.length
        ? warn(plural(urls.length, "temporary redirect"), "Temporary redirects do not pass full ranking value to the new URL.", { urls, checked: urls.length, failed: urls.length })
        : pass("None", "All internal redirects are permanent (301/308).", { checked: ctx.pages.length, failed: 0 })
    },
  }),

  /* ------------------------------------------------- 404s and URL variants */
  siteCheck({
    id: "soft-404",
    group: "crawlHealth",
    name: "Missing pages return a real 404",
    severity: "warning",
    fix: "Configure the server so unknown URLs return a 404 status (with your friendly page), not 200.",
    run: (ctx) => {
      const nf = ctx.crawl.probes.notFound
      if (!nf || nf.status === 0) return notChecked(nf?.error ?? "The probe for a non-existent page could not be completed.")
      const lookalikes = ctx.html.filter((p) => p.status === 200 && /^(404|page not found|not found|error 404)/i.test(p.raw!.title.trim())).map((p) => p.path)
      const soft = nf.status === 200
      const ok = (nf.status === 404 || nf.status === 410) && lookalikes.length === 0
      return ok
        ? pass(`HTTP ${nf.status}`, "A made-up URL returned a proper 404.", { checked: 1, failed: 0 })
        : warn(soft ? "Soft 404 (HTTP 200)" : `HTTP ${nf.status}`, soft ? `A made-up URL returned 200 with a "not found" style page (${short(nf.title, 50) || "no title"}). Google treats these as soft 404s.` : `A made-up URL returned HTTP ${nf.status} instead of 404.${lookalikes.length ? " Some 200 pages also look like error pages." : ""}`, { urls: [nf.url, ...lookalikes], checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "url-duplicates",
    group: "crawlHealth",
    name: "No duplicate URL variants",
    severity: "info",
    fix: "Link to one form of each URL (consistent trailing slash, no tracking parameters) and canonicalise parameter pages to the clean URL.",
    run: (ctx) => {
      const variants = ctx.crawl.linkVariants
      const params = ctx.crawl.paramUrls
      if (!variants.length && !params.length) return pass("None", "Internal links use one form of each URL and no parameter pages were found.", { checked: ctx.pages.length, failed: 0 })
      const groups = [
        ...(variants.length ? [{ label: "The same page linked in different forms (slash, www or http)", urls: variants.map((v) => v.forms.join("  |  ")) }] : []),
        ...(params.length ? [{ label: "Internal URLs with parameters (not crawled)", urls: params }] : []),
      ]
      return warn(`${variants.length + params.length} found`, `${variants.length ? `${plural(variants.length, "page")} linked in more than one URL form. ` : ""}${params.length ? `${plural(params.length, "parameter URL")} found. ` : ""}These can be indexed as duplicates.`, { groups, urls: groups.flatMap((g) => g.urls), checked: ctx.pages.length, failed: variants.length + params.length })
    },
  }),
]
