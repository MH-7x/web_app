import { config, fail, list, notChecked, pageCheck, pass, plural, short, siteCheck, warn, type CheckDef, type Ctx } from "@/lib/audit/checks/util"
import type { CrawledPage } from "@/lib/audit/crawl-types"
import { containsPhrase, fleschReadingEase, keywordDensity, similarity, words, wordOverlap } from "@/lib/audit/text"
import type { SiteOutcome } from "@/lib/audit/checks/util"

const h1s = (p: CrawledPage) => p.raw!.headings.filter((h) => h.level === 1 && h.text)

/** Group pages whose values are equal (after trimming and lowercasing). */
function duplicateGroups(pages: CrawledPage[], value: (p: CrawledPage) => string) {
  const map = new Map<string, { label: string; urls: string[] }>()
  for (const p of pages) {
    const v = value(p).trim()
    if (!v) continue
    const key = v.toLowerCase()
    const g = map.get(key) ?? { label: v, urls: [] }
    g.urls.push(p.path)
    map.set(key, g)
  }
  return [...map.values()].filter((g) => g.urls.length > 1)
}

/** Union pages into clusters where each is similar to at least one other. */
function cluster(pages: CrawledPage[], similar: (a: CrawledPage, b: CrawledPage) => boolean) {
  const parent = pages.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) if (similar(pages[i], pages[j])) parent[find(i)] = find(j)
  const groups = new Map<number, CrawledPage[]>()
  pages.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]))
  return [...groups.values()].filter((g) => g.length > 1)
}

const brandTokens = (ctx: Ctx) => new Set([ctx.client.name, ctx.client.emirate, ...ctx.client.emiratesServed, ...ctx.client.areas].flatMap((s) => words(s)))
const stripBrand = (title: string, drop: Set<string>) => words(title).filter((w) => !drop.has(w)).join(" ")

const keywordGate = (ctx: Ctx): SiteOutcome | null => {
  if (!ctx.input.targetKeyword) return notChecked("No target keyword was entered when the audit was started.")
  if (!ctx.targetPage?.raw) return notChecked("The target page could not be read, so the keyword could not be checked.")
  return null
}

const kwCheck = (id: string, name: string, where: string, get: (p: CrawledPage) => string, fix: string) =>
  siteCheck({
    id,
    group: "onPage",
    name,
    severity: "warning",
    fix,
    run: (ctx) => {
      const gate = keywordGate(ctx)
      if (gate) return gate
      const p = ctx.targetPage!
      const keyword = ctx.input.targetKeyword!
      const ok = containsPhrase(get(p), keyword)
      return ok
        ? pass(`Found in ${where}`, `"${keyword}" appears in the ${where} of ${p.path}.`, { checked: 1, failed: 0 })
        : warn(`Missing from ${where}`, `"${keyword}" does not appear in the ${where} of ${p.path}.`, { urls: [p.path], checked: 1, failed: 1 })
    },
  })

const REQUIRED: Record<string, (ctx: Ctx) => (keyof import("@/lib/audit/extract").RawSchemaNode | "address")[]> = {
  localbusiness: (ctx) => ["name", "telephone", ...(ctx.isServiceArea ? [] : (["address"] as const))],
  organization: () => ["name", "url"],
  website: () => ["name", "url"],
  service: () => ["name", "hasProvider"],
  person: () => ["name"],
}
const LOCAL_FAMILY = /^(MovingCompany|LocalBusiness|HomeAndConstructionBusiness|ProfessionalService|Store|GeneralContractor)$/i

export const checks: CheckDef[] = [
  /* ------------------------------------------------------------ titles */
  pageCheck({
    id: "title-missing",
    group: "onPage",
    name: "Title tag present",
    severity: "critical",
    fix: "Add a unique title of 30 to 60 characters with the main service and city near the start.",
    test: (p) => ({ pass: Boolean(p.raw!.title), detail: p.path }),
    passMessage: "Every page has a title tag.",
    failMessage: "have no title tag. It is the biggest on-page signal and the headline in search results.",
  }),
  pageCheck({
    id: "title-length",
    group: "onPage",
    name: "Title tag length",
    severity: "warning",
    fix: "Rewrite to 30 to 60 characters, keeping the service and location up front.",
    test: (p) => {
      const n = p.raw!.title.length
      return n ? { pass: n >= 15 && n <= 60, detail: `${p.path} (${n} chars)` } : null
    },
    passMessage: "Title lengths are within 15 to 60 characters.",
    failMessage: "have a title that is too long (it gets cut off in results) or too short.",
  }),
  pageCheck({
    id: "title-duplicate",
    group: "onPage",
    name: "Unique title tags",
    severity: "warning",
    fix: "Give every page its own title that describes that page's service or area.",
    test: (p, ctx) => {
      if (!p.raw!.title) return null
      const dup = duplicateGroups(ctx.html, (x) => x.raw!.title).some((g) => g.urls.includes(p.path))
      return { pass: !dup, detail: p.path }
    },
    summarize: (_, ctx) => ({ groups: duplicateGroups(ctx.html, (x) => x.raw!.title).map((g) => ({ label: `"${short(g.label, 80)}"`, urls: g.urls })) }),
    passMessage: "No two pages share a title.",
    failMessage: "share a title with another page, so they compete in results.",
  }),
  siteCheck({
    id: "title-near-duplicate",
    group: "onPage",
    name: "Near-duplicate titles",
    severity: "warning",
    fix: "Make titles differ in more than the area or brand name: lead with what is distinct about each page.",
    run: (ctx) => {
      const drop = brandTokens(ctx)
      const pages = ctx.html.filter((p) => stripBrand(p.raw!.title, drop).split(" ").length >= 2)
      const exact = new Set(duplicateGroups(ctx.html, (p) => p.raw!.title).flatMap((g) => g.urls))
      const groups = cluster(pages, (a, b) => a.raw!.title.toLowerCase() !== b.raw!.title.toLowerCase() && wordOverlap(stripBrand(a.raw!.title, drop), stripBrand(b.raw!.title, drop)) >= config.nearDuplicateTitle)
        .map((g) => ({ label: `Near-identical once the brand and place names are removed`, urls: g.map((p) => p.path) }))
        .filter((g) => !g.urls.every((u) => exact.has(u)))
      return groups.length
        ? warn(plural(groups.length, "group"), `${groups.length} ${groups.length === 1 ? "set of pages has" : "sets of pages have"} titles that differ only by brand or place names.`, { groups, urls: groups.flatMap((g) => g.urls), checked: pages.length, failed: groups.reduce((n, g) => n + g.urls.length, 0) })
        : pass("None found", "No titles are near-identical once brand and place names are ignored.", { checked: pages.length, failed: 0 })
    },
  }),
  pageCheck({
    id: "title-pixel",
    group: "onPage",
    name: "Title width in search results",
    severity: "info",
    fix: "Shorten the title (about 600 pixels fits on desktop results), or move the key words to the start.",
    test: (p) => {
      const px = p.raw!.titlePx
      return px ? { pass: px <= config.titlePxMax, detail: `${p.path} (${px}px)` } : null
    },
    passMessage: "Titles fit within about 600 pixels.",
    failMessage: "have a title wider than about 600 pixels, so Google will truncate it.",
  }),

  /* ------------------------------------------------------------- metas */
  pageCheck({
    id: "meta-missing",
    group: "onPage",
    name: "Meta description present",
    severity: "warning",
    fix: "Write a 70 to 160 character description with a benefit and a call to action.",
    test: (p) => ({ pass: Boolean(p.raw!.metaDescription), detail: p.path }),
    passMessage: "Every page has a meta description.",
    failMessage: "have no meta description, so Google writes its own snippet, usually a worse one.",
  }),
  pageCheck({
    id: "meta-length",
    group: "onPage",
    name: "Meta description length",
    severity: "info",
    fix: "Aim for 120 to 155 characters.",
    test: (p) => {
      const n = p.raw!.metaDescription.length
      return n ? { pass: n >= config.metaMin && n <= config.metaMax, detail: `${p.path} (${n} chars)` } : null
    },
    passMessage: "Meta descriptions are within 70 to 160 characters.",
    failMessage: "have a meta description over 160 characters (truncated) or under 70 (space unused).",
  }),
  pageCheck({
    id: "meta-duplicate",
    group: "onPage",
    name: "Unique meta descriptions",
    severity: "warning",
    fix: "Write a distinct description for each page.",
    test: (p, ctx) => {
      if (!p.raw!.metaDescription) return null
      return { pass: !duplicateGroups(ctx.html, (x) => x.raw!.metaDescription).some((g) => g.urls.includes(p.path)), detail: p.path }
    },
    summarize: (_, ctx) => ({ groups: duplicateGroups(ctx.html, (x) => x.raw!.metaDescription).map((g) => ({ label: `"${short(g.label, 80)}"`, urls: g.urls })) }),
    passMessage: "No two pages share a meta description.",
    failMessage: "share a meta description with another page.",
  }),
  pageCheck({
    id: "meta-pixel",
    group: "onPage",
    name: "Meta description width in search results",
    severity: "info",
    fix: "Shorten the description so the call to action is not cut off (about 960 pixels on desktop).",
    test: (p) => {
      const px = p.raw!.metaPx
      return px ? { pass: px <= config.metaPxMax, detail: `${p.path} (${px}px)` } : null
    },
    passMessage: "Meta descriptions fit within about 960 pixels.",
    failMessage: "have a meta description wider than about 960 pixels.",
  }),

  /* ---------------------------------------------------------- headings */
  pageCheck({
    id: "h1-missing",
    group: "onPage",
    name: "H1 heading present",
    severity: "critical",
    fix: "Add one H1 that states the page's main topic and includes the main keyword naturally.",
    test: (p) => ({ pass: h1s(p).length > 0, detail: p.path }),
    passMessage: "Every page has an H1.",
    failMessage: "have no H1 heading, which tells visitors and search engines what the page is about.",
  }),
  pageCheck({
    id: "h1-multiple",
    group: "onPage",
    name: "Single H1 per page",
    severity: "warning",
    fix: "Keep one H1 and turn the others into H2s.",
    test: (p) => {
      const n = h1s(p).length
      return n ? { pass: n === 1, detail: `${p.path} (${n} H1s)` } : null
    },
    passMessage: "Every page has exactly one H1.",
    failMessage: "have more than one H1, which dilutes the page's main topic.",
  }),
  siteCheck({
    id: "h1-duplicate",
    group: "onPage",
    name: "Unique H1 across pages",
    severity: "warning",
    fix: "Give each page its own H1 that matches that page's topic or area.",
    run: (ctx) => {
      const groups = duplicateGroups(ctx.html, (p) => h1s(p)[0]?.text ?? "").map((g) => ({ label: `"${short(g.label, 80)}"`, urls: g.urls }))
      return groups.length
        ? warn(plural(groups.length, "shared H1"), `${groups.reduce((n, g) => n + g.urls.length, 0)} pages share an H1 with another page.`, { groups, urls: groups.flatMap((g) => g.urls), checked: ctx.html.length, failed: groups.reduce((n, g) => n + g.urls.length, 0) })
        : pass("All unique", "No two pages share the same H1.", { checked: ctx.html.length, failed: 0 })
    },
  }),
  pageCheck({
    id: "h2-missing",
    group: "onPage",
    name: "H2 subheadings used",
    severity: "info",
    fix: "Break the content into sections with descriptive H2s.",
    test: (p) => ({ pass: p.raw!.headings.some((h) => h.level === 2 && h.text), detail: p.path }),
    passMessage: "Pages use H2 subheadings.",
    failMessage: "have no H2 subheadings; sections give search engines more topic signals.",
  }),
  pageCheck({
    id: "heading-structure",
    group: "onPage",
    name: "Heading hierarchy",
    severity: "info",
    fix: "Use headings in order (H1, then H2, then H3) without skipping levels, and remove empty headings.",
    test: (p) => {
      const hs = p.raw!.headings
      if (!hs.length) return null
      const problems: string[] = []
      let prev = 0
      for (const h of hs) {
        if (prev && h.level > prev + 1) problems.push(`skips H${prev} to H${h.level}`)
        prev = h.level
      }
      const empty = hs.filter((h) => !h.text).length
      if (empty) problems.push(`${plural(empty, "empty heading")}`)
      return { pass: problems.length === 0, detail: `${p.path}: ${[...new Set(problems)].slice(0, 3).join("; ")}` }
    },
    passMessage: "Headings follow a clean order on every page.",
    failMessage: "skip heading levels or contain empty headings.",
  }),
  siteCheck({
    id: "headings-usage",
    group: "onPage",
    name: "Heading usage (H1 to H6)",
    severity: "info",
    run: (ctx) => {
      const counts = [1, 2, 3, 4, 5, 6].map((lvl) => ctx.html.reduce((n, p) => n + p.raw!.headings.filter((h) => h.level === lvl).length, 0))
      return pass(counts.map((c, i) => `H${i + 1}: ${c}`).join(" · "), `Headings across ${plural(ctx.html.length, "page")}: ${counts.map((c, i) => `${c} H${i + 1}`).join(", ")}.`, { checked: ctx.html.length, failed: 0 })
    },
  }),

  /* ------------------------------------------------------- images, lang */
  pageCheck({
    id: "img-alt",
    group: "onPage",
    name: "Image alt text",
    severity: "warning",
    fix: 'Describe each meaningful image in a few words; use alt="" for purely decorative ones.',
    test: (p) => {
      const imgs = p.raw!.images
      if (!imgs.length) return null
      const missing = imgs.filter((i) => i.alt === null).length
      return { pass: missing === 0, detail: `${p.path} (${missing} of ${imgs.length} images)` }
    },
    passMessage: "Every image has an alt attribute.",
    failMessage: "have images without alt text, which is how search engines and screen readers understand them.",
  }),
  pageCheck({
    id: "lang",
    group: "onPage",
    name: "Language attribute declared",
    severity: "info",
    fix: 'Set lang="en" or lang="ar" on the html element (and dir="rtl" for Arabic).',
    test: (p) => ({ pass: Boolean(p.raw!.lang), detail: p.path }),
    summarize: (units, ctx) => ({ value: [...new Set(ctx.html.map((p) => p.raw!.lang).filter(Boolean))].join(", ") || "none declared" }),
    passMessage: "The html lang attribute is declared on every page.",
    failMessage: "do not declare the page language, which matters for Arabic and English sites.",
  }),

  /* ----------------------------------------------------------- content */
  pageCheck({
    id: "thin-content",
    group: "onPage",
    name: "Content length",
    severity: "info",
    fix: "Expand the page with service details, areas covered, process and common questions.",
    test: (p) => ({ pass: p.raw!.bodyText.split(/\s+/).filter(Boolean).length >= config.thinContentWords, detail: `${p.path} (${p.raw!.bodyText.split(/\s+/).filter(Boolean).length} words)` }),
    passMessage: `Every page has at least ${config.thinContentWords} words.`,
    failMessage: `have under ${config.thinContentWords} words, which rarely ranks for competitive local searches.`,
  }),
  siteCheck({
    id: "content-duplicate",
    group: "onPage",
    name: "Duplicate content",
    severity: "warning",
    fix: "Rewrite the shared text so each page says something specific: real details about that area or service, not just a swapped name.",
    run: (ctx) => {
      // pages kept out of the index (author archives and the like) cannot cause duplicate-content problems
      const eligible = ctx.html.filter((p) => p.minhash && words(p.raw!.mainText).length >= config.minWordsForDuplicate && !p.raw!.robotsMeta.includes("noindex"))
      if (eligible.length < 2) return pass("Nothing to compare", `Only ${plural(eligible.length, "page")} has enough text to compare.`, { checked: eligible.length, failed: 0 })
      const groups = cluster(eligible, (a, b) => similarity(a.minhash!, b.minhash!) >= config.nearDuplicateContent).map((g) => ({
        label: `Roughly ${Math.round(100 * Math.min(...g.slice(1).map((p) => similarity(g[0].minhash!, p.minhash!))))}%+ identical text`,
        urls: g.map((p) => p.path),
      }))
      return groups.length
        ? warn(plural(groups.length, "duplicate group"), `${groups.reduce((n, g) => n + g.urls.length, 0)} pages carry text that is mostly identical to another page (common on area pages that differ only by the place name).`, { groups, urls: groups.flatMap((g) => g.urls), checked: eligible.length, failed: groups.reduce((n, g) => n + g.urls.length, 0) })
        : pass("None found", `${plural(eligible.length, "page")} compared: no near-duplicate text.`, { checked: eligible.length, failed: 0 })
    },
  }),
  pageCheck({
    id: "readability",
    group: "onPage",
    name: "Readability (English pages)",
    severity: "info",
    fix: "Use shorter sentences and everyday words. Aim for a Flesch score of 50 or more.",
    pages: (ctx) => ctx.english,
    test: (p) => {
      const score = fleschReadingEase(p.raw!.mainText)
      return score === null ? null : { pass: score >= 50, detail: `${p.path} (Flesch ${score})` }
    },
    passMessage: "English pages read at a plain-English level.",
    failMessage: "are hard to read (Flesch reading ease below 50).",
    skipWhen: (ctx) => (ctx.english.length === 0 ? "No English pages with enough text were found. Readability scoring supports English only." : null),
  }),
  pageCheck({
    id: "cta-above-fold",
    group: "onPage",
    name: "Call to action above the fold",
    severity: "warning",
    fix: "Show a phone, WhatsApp or quote button in the first screen of the homepage, service and area pages.",
    pages: (ctx) => ctx.html.filter((p) => ctx.keyPages.has(p.url)),
    test: (p) => {
      const c = p.raw!.cta
      const found = [c.tel && "phone", c.whatsapp && "WhatsApp", c.form && "form", c.button && "button"].filter(Boolean)
      return { pass: found.length > 0, detail: found.length ? `${p.path} (${found.join(", ")})` : p.path }
    },
    passMessage: "Key pages show a way to get in touch in the first screen.",
    failMessage: "have no phone, WhatsApp or quote form visible without scrolling.",
  }),
  siteCheck({
    id: "faq-presence",
    group: "onPage",
    name: "FAQ section",
    severity: "info",
    fix: "Add an FAQ section answering the questions customers ask before booking (cost, permits, timing, packing).",
    run: (ctx) => {
      const withFaq = ctx.html.filter((p) => p.raw!.faq.headingFound && p.raw!.faq.items >= 3)
      return withFaq.length
        ? pass(plural(withFaq.length, "page"), `FAQ sections found on ${list(withFaq.map((p) => p.path))}.`, { checked: ctx.html.length, failed: 0 })
        : warn("None found", "No page has a visible FAQ section.", { checked: ctx.html.length, failed: 1 })
    },
  }),
  pageCheck({
    id: "faq-schema",
    group: "onPage",
    name: "FAQPage schema where an FAQ exists",
    severity: "warning",
    fix: "Mark the FAQ up with FAQPage JSON-LD so the questions can show in results.",
    test: (p) => {
      if (!(p.raw!.faq.headingFound && p.raw!.faq.items >= 3)) return null
      return { pass: p.raw!.schema.some((n) => n.types.some((t) => /^FAQPage$/i.test(t)) && n.faqQuestions.length > 0), detail: p.path }
    },
    passMessage: "Pages with an FAQ also carry FAQPage schema.",
    failMessage: "have an FAQ section but no FAQPage schema.",
    skipWhen: (ctx) => (ctx.html.some((p) => p.raw!.faq.headingFound && p.raw!.faq.items >= 3) ? null : "No page has an FAQ section, so there is nothing to mark up."),
  }),

  /* ------------------------------------------------- structured data */
  siteCheck({
    id: "schema-any",
    group: "onPage",
    name: "Structured data (JSON-LD) on the site",
    severity: "critical",
    fix: "Add JSON-LD with a MovingCompany or LocalBusiness block to the homepage.",
    run: (ctx) => {
      const nodes = ctx.html.flatMap((p) => p.raw!.schema)
      return nodes.length
        ? pass(`${nodes.length} blocks`, `JSON-LD found: ${list([...new Set(nodes.flatMap((n) => n.types))])}.`, { checked: 1, failed: 0 })
        : fail("None", "No structured data (JSON-LD) was found on any page. It is how you tell Google your business name, location, services and contact details.", { checked: 1, failed: 1 })
    },
  }),
  pageCheck({
    id: "schema-page",
    group: "onPage",
    name: "Structured data on each page",
    severity: "info",
    fix: "Add BreadcrumbList to every inner page, plus Service or FAQPage where the content fits.",
    test: (p) => ({ pass: p.raw!.schema.length > 0, detail: p.path }),
    passMessage: "Every page has structured data.",
    failMessage: "have no structured data; inner pages benefit from Service, FAQPage or BreadcrumbList markup.",
  }),
  pageCheck({
    id: "schema-invalid",
    group: "onPage",
    name: "JSON-LD syntax is valid",
    severity: "warning",
    fix: "Validate the markup with Google's Rich Results Test and fix the syntax errors.",
    test: (p) => ({ pass: p.raw!.schemaInvalid === 0, detail: p.path }),
    passMessage: "All JSON-LD blocks parse.",
    failMessage: "contain JSON-LD that does not parse. A broken block is ignored entirely.",
  }),
  pageCheck({
    id: "jsonld-required",
    group: "onPage",
    name: "JSON-LD has the required properties",
    severity: "warning",
    fix: "Add the missing properties to each block, matching what the page shows.",
    test: (p, ctx) => {
      const problems: string[] = []
      for (const node of p.raw!.schema) {
        for (const t of node.types) {
          const key = LOCAL_FAMILY.test(t) ? "localbusiness" : t.toLowerCase()
          const need = REQUIRED[key]?.(ctx)
          if (!need) continue
          const missing = need.filter((k) => (k === "address" ? !node.address : !node[k as keyof typeof node]))
          if (missing.length) problems.push(`${t} lacks ${missing.map((m) => (m === "hasProvider" ? "provider" : m)).join(", ")}`)
        }
        if (node.types.some((t) => /^FAQPage$/i.test(t)) && !node.faqQuestions.length) problems.push("FAQPage has no questions")
        if (node.types.some((t) => /^BreadcrumbList$/i.test(t)) && !node.hasItemList) problems.push("BreadcrumbList has no items")
      }
      if (!p.raw!.schema.length) return null
      return { pass: problems.length === 0, detail: `${p.path}: ${problems.slice(0, 3).join("; ")}` }
    },
    passMessage: "Every structured data block has its required properties.",
    failMessage: "have structured data missing required properties.",
  }),
  pageCheck({
    id: "jsonld-mismatch",
    group: "onPage",
    name: "JSON-LD matches the visible page",
    severity: "info",
    fix: "Make the structured data say what the page says: same business name, same phone number, FAQ questions that are really on the page.",
    test: (p) => {
      if (!p.raw!.schema.length) return null
      const text = p.raw!.bodyText.toLowerCase()
      const problems: string[] = []
      for (const n of p.raw!.schema) {
        if (n.name && !text.includes(n.name.toLowerCase()) && !p.raw!.title.toLowerCase().includes(n.name.toLowerCase()) && n.types.some((t) => /Organization|Business|MovingCompany|Service/i.test(t))) problems.push(`name "${short(n.name, 30)}" is not on the page`)
        for (const q of n.faqQuestions.slice(0, 20)) if (!text.includes(q.toLowerCase().slice(0, 30))) { problems.push("FAQ question not visible on the page"); break }
      }
      return { pass: problems.length === 0, detail: `${p.path}: ${[...new Set(problems)].slice(0, 2).join("; ")}` }
    },
    passMessage: "Structured data agrees with the visible content.",
    failMessage: "have structured data that does not match what visitors see.",
  }),

  /* ----------------------------------------------------------- keywords */
  kwCheck("kw-title", "Target keyword in the title", "title", (p) => p.raw!.title, "Put the target keyword near the start of the title tag."),
  kwCheck("kw-h1", "Target keyword in the H1", "H1", (p) => h1s(p)[0]?.text ?? "", "Include the target keyword in the page's H1."),
  kwCheck("kw-first100", "Target keyword in the first 100 words", "first 100 words", (p) => words(p.raw!.mainText).slice(0, 100).join(" "), "Mention the target keyword naturally in the opening paragraph."),
  kwCheck("kw-url", "Target keyword in the URL", "URL", (p) => decodeURIComponent(p.path).replace(/[-_/]/g, " "), "Use the keyword in the page's URL slug (for example /villa-movers-dubai)."),
  kwCheck("kw-meta", "Target keyword in the meta description", "meta description", (p) => p.raw!.metaDescription, "Include the target keyword in the meta description."),
  siteCheck({
    id: "kw-density",
    group: "onPage",
    name: "Keyword density (stuffing check)",
    severity: "warning",
    fix: "Use the keyword where it reads naturally and vary the wording; aim for under about 3% of the words.",
    run: (ctx) => {
      const gate = keywordGate(ctx)
      if (gate) return gate
      const p = ctx.targetPage!
      const d = keywordDensity(p.raw!.mainText, ctx.input.targetKeyword!)
      if (d === 0) return warn("0%", `"${ctx.input.targetKeyword}" never appears in the body text of ${p.path}.`, { urls: [p.path], checked: 1, failed: 1 })
      return d > config.keywordDensityMax
        ? warn(`${d}%`, `"${ctx.input.targetKeyword}" makes up ${d}% of the words on ${p.path}, which looks like keyword stuffing.`, { urls: [p.path], checked: 1, failed: 1 })
        : pass(`${d}%`, `"${ctx.input.targetKeyword}" is about ${d}% of the words on ${p.path}, a natural level.`, { checked: 1, failed: 0 })
    },
  }),
  siteCheck({
    id: "rankings-organic",
    group: "onPage",
    name: "Organic keyword rankings",
    severity: "info",
    run: () => notChecked("Ranking positions come from a paid rank-tracking data source (for example Semrush, Ahrefs or Google Search Console). None is connected, so no ranking data was used."),
  }),
]

