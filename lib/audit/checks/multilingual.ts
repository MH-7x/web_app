import { list, notChecked, pageCheck, pass, plural, siteCheck, warn, pageLanguage, type CheckDef, type Ctx } from "@/lib/audit/checks/util"
import { normalizeUrl } from "@/lib/audit/crawler"
import { arabicRatio } from "@/lib/audit/text"

/** ar, ar-AE, en, en-AE ... or x-default */
const HREFLANG = /^(x-default|[a-z]{2,3}(-[A-Za-z]{4})?(-([A-Z]{2}|\d{3}))?)$/
const bare = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase()

const bilingual = (ctx: Ctx) => ctx.arabic.length > 0 && ctx.english.length > 0
const gate = (ctx: Ctx) => (bilingual(ctx) ? null : ctx.arabic.length === 0 && ctx.english.length === 0 ? "No Arabic or English pages could be identified." : `Only ${ctx.arabic.length ? "Arabic" : "English"} pages were found, so there are no language versions to compare.`)
const withHreflang = (ctx: Ctx) => ctx.html.filter((p) => p.raw!.hreflang.length > 0)

export const checks: CheckDef[] = [
  siteCheck({
    id: "ml-detect",
    group: "multilingual",
    name: "Arabic and English versions",
    severity: "info",
    run: (ctx) =>
      pass(
        `${ctx.english.length} English · ${ctx.arabic.length} Arabic`,
        bilingual(ctx) ? `The site has ${plural(ctx.english.length, "English page")} and ${plural(ctx.arabic.length, "Arabic page")}.` : `Only ${ctx.arabic.length ? "Arabic" : "English"} content was detected, so the multilingual checks below do not apply.`,
        { checked: ctx.html.length, failed: 0 }
      ),
  }),
  siteCheck({
    id: "ml-hreflang-present",
    group: "multilingual",
    name: "Hreflang annotations used",
    severity: "warning",
    fix: "Add <link rel=\"alternate\" hreflang=\"…\"> tags on every page pointing to its Arabic and English versions (and x-default).",
    run: (ctx) => {
      const g = gate(ctx)
      if (g) return notChecked(g)
      const n = withHreflang(ctx).length
      return n ? pass(plural(n, "page"), `${plural(n, "page")} declare hreflang.`, { checked: ctx.html.length, failed: 0 }) : warn("None", "The site has Arabic and English pages but no hreflang tags, so search engines may show the wrong language or treat the versions as duplicates.", { checked: ctx.html.length, failed: ctx.html.length })
    },
  }),
  pageCheck({
    id: "ml-hreflang-codes",
    group: "multilingual",
    name: "Hreflang codes are valid (ar, ar-AE, en, en-AE)",
    severity: "warning",
    fix: "Use ISO language codes with an optional uppercase region, such as ar, ar-AE, en or en-AE; use x-default for the fallback.",
    pages: (ctx) => withHreflang(ctx),
    test: (p) => {
      const bad = p.raw!.hreflang.filter((h) => !HREFLANG.test(h.lang))
      return { pass: bad.length === 0, detail: `${p.path} (${bad.map((b) => `"${b.lang}"`).join(", ")})` }
    },
    passMessage: "All hreflang codes are well-formed.",
    failMessage: "use hreflang codes that are not valid.",
    skipWhen: (ctx) => gate(ctx) ?? (withHreflang(ctx).length ? null : "No page declares hreflang."),
  }),
  pageCheck({
    id: "ml-hreflang-self",
    group: "multilingual",
    name: "Each page lists itself in hreflang",
    severity: "warning",
    fix: "Include a self-referencing hreflang entry on every page.",
    pages: (ctx) => withHreflang(ctx),
    test: (p) => ({ pass: p.raw!.hreflang.some((h) => bare(h.href) === bare(p.url)), detail: p.path }),
    passMessage: "Every page references itself in its hreflang set.",
    failMessage: "do not include themselves in their hreflang set.",
    skipWhen: (ctx) => gate(ctx) ?? (withHreflang(ctx).length ? null : "No page declares hreflang."),
  }),
  pageCheck({
    id: "ml-hreflang-reciprocal",
    group: "multilingual",
    name: "Hreflang links are reciprocal (return links)",
    severity: "critical",
    fix: "Every page that points to another language version must be pointed back at by that version. Missing return links make Google ignore the annotation.",
    pages: (ctx) => withHreflang(ctx),
    test: (p, ctx) => {
      const missing: string[] = []
      let checked = 0
      for (const h of p.raw!.hreflang) {
        if (bare(h.href) === bare(p.url)) continue
        const target = ctx.lookup.get(normalizeUrl(h.href) ?? "")
        if (!target?.raw) continue // not crawled: cannot verify
        checked++
        if (!target.raw.hreflang.some((b) => bare(b.href) === bare(p.url))) missing.push(target.path)
      }
      return checked ? { pass: missing.length === 0, detail: `${p.path} → no return link from ${list(missing)}` } : null
    },
    passMessage: "Every crawled hreflang pair links back both ways.",
    failMessage: "point to a language version that does not link back.",
    skipWhen: (ctx) => gate(ctx) ?? (withHreflang(ctx).length ? null : "No page declares hreflang."),
  }),
  siteCheck({
    id: "ml-hreflang-xdefault",
    group: "multilingual",
    name: "x-default hreflang",
    severity: "info",
    fix: 'Add hreflang="x-default" pointing at the page visitors with an unlisted language should see.',
    run: (ctx) => {
      const g = gate(ctx)
      if (g) return notChecked(g)
      const pages = withHreflang(ctx)
      if (!pages.length) return notChecked("No page declares hreflang.")
      const without = pages.filter((p) => !p.raw!.hreflang.some((h) => h.lang === "x-default"))
      return without.length ? warn(`${without.length} of ${pages.length} lack it`, "Some hreflang sets have no x-default fallback.", { urls: without.map((p) => p.path), checked: pages.length, failed: without.length }) : pass("Present", "Every hreflang set has an x-default.", { checked: pages.length, failed: 0 })
    },
  }),
  pageCheck({
    id: "ml-hreflang-urls",
    group: "multilingual",
    name: "Hreflang URLs return 200 and are canonical",
    severity: "warning",
    fix: "Point hreflang only at live, indexable pages whose canonical is themselves.",
    pages: (ctx) => withHreflang(ctx),
    test: (p, ctx) => {
      const bad: string[] = []
      let checked = 0
      for (const h of p.raw!.hreflang) {
        const target = ctx.lookup.get(normalizeUrl(h.href) ?? "")
        if (!target) continue
        checked++
        if (target.status !== 200) bad.push(`${target.path} (HTTP ${target.status})`)
        else if (target.raw?.canonicals[0] && bare(target.raw.canonicals[0]) !== bare(target.url)) bad.push(`${target.path} (canonical elsewhere)`)
      }
      return checked ? { pass: bad.length === 0, detail: `${p.path} → ${list(bad)}` } : null
    },
    passMessage: "Hreflang targets are live and canonical.",
    failMessage: "point hreflang at pages that error, redirect or canonicalise elsewhere.",
    skipWhen: (ctx) => gate(ctx) ?? (withHreflang(ctx).length ? null : "No page declares hreflang."),
  }),
  pageCheck({
    id: "ml-html-lang-dir",
    group: "multilingual",
    name: 'Correct lang and dir="rtl" on each language version',
    severity: "warning",
    fix: 'Set lang="ar" and dir="rtl" on the html element of Arabic pages, and lang="en" on English pages.',
    pages: (ctx) => [...ctx.arabic, ...ctx.english],
    test: (p) => {
      const ar = pageLanguage(p) === "ar"
      const raw = p.raw!
      const problems: string[] = []
      if (ar) {
        if (!raw.lang.toLowerCase().startsWith("ar")) problems.push(`lang is "${raw.lang || "missing"}", not ar`)
        if (raw.dir.toLowerCase() !== "rtl") problems.push("dir is not rtl")
      } else if (!raw.lang.toLowerCase().startsWith("en")) problems.push(`lang is "${raw.lang || "missing"}", not en`)
      return { pass: problems.length === 0, detail: `${p.path}: ${problems.join(", ")}` }
    },
    passMessage: "Arabic pages are marked lang=ar with dir=rtl; English pages lang=en.",
    failMessage: "have the wrong language or text-direction attributes.",
    skipWhen: gate,
  }),
  pageCheck({
    id: "ml-canonical-self",
    group: "multilingual",
    name: "Each language version canonicalises to itself",
    severity: "warning",
    fix: "Each language version's canonical must be its own URL. Pointing the Arabic page's canonical at the English page tells Google to ignore the Arabic one.",
    pages: (ctx) => [...ctx.arabic, ...ctx.english],
    test: (p, ctx) => {
      const c = p.raw!.canonicals[0]
      if (!c) return null
      const target = ctx.lookup.get(normalizeUrl(c) ?? "")
      const other = target && target !== p && pageLanguage(target) !== pageLanguage(p)
      return { pass: bare(c) === bare(p.url) || !other, detail: `${p.path} → ${target?.path ?? c} (${target ? pageLanguage(target) : "other"} version)` }
    },
    passMessage: "No language version canonicalises to the other language.",
    failMessage: "canonicalise to a page in the other language.",
    skipWhen: gate,
  }),
  pageCheck({
    id: "ml-arabic-content",
    group: "multilingual",
    name: "Arabic pages have Arabic titles, descriptions and headings",
    severity: "warning",
    fix: "Write the title, meta description and headings of Arabic pages in Arabic, not the English text copied over.",
    pages: (ctx) => ctx.arabic,
    test: (p) => {
      const raw = p.raw!
      const h1 = raw.headings.find((h) => h.level === 1)?.text ?? ""
      const parts = [
        { name: "title", text: raw.title },
        { name: "meta description", text: raw.metaDescription },
        { name: "H1", text: h1 },
      ].filter((x) => x.text)
      const english = parts.filter((x) => arabicRatio(x.text) < 0.3).map((x) => x.name)
      return { pass: english.length === 0, detail: `${p.path} (${english.join(", ")} not in Arabic)` }
    },
    passMessage: "Arabic pages carry Arabic titles, descriptions and headings.",
    failMessage: "are Arabic pages whose title, description or H1 is still in English.",
    skipWhen: (ctx) => (ctx.arabic.length ? null : "No Arabic pages were found."),
  }),
  pageCheck({
    id: "ml-hreflang-conflict",
    group: "multilingual",
    name: "Hreflang and canonical do not conflict",
    severity: "warning",
    fix: "A page's canonical and its own hreflang entry should name the same URL. Fix whichever is wrong.",
    pages: (ctx) => withHreflang(ctx),
    test: (p) => {
      const c = p.raw!.canonicals[0]
      const noindex = p.raw!.robotsMeta.includes("noindex")
      if (!c && !noindex) return null
      // a page that is part of a hreflang set must be its own canonical: otherwise the two signals contradict each other
      const conflict = Boolean(c) && bare(c) !== bare(p.url)
      return { pass: !conflict && !noindex, detail: `${p.path}${noindex ? " is noindex but sits in a hreflang set" : ` is in a hreflang set but its canonical is ${c}`}` }
    },
    passMessage: "Hreflang and canonical tags agree.",
    failMessage: "send conflicting hreflang and canonical signals.",
    skipWhen: (ctx) => gate(ctx) ?? (withHreflang(ctx).length ? null : "No page declares hreflang."),
  }),
]

