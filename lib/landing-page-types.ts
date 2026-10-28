/** Types, validation, SEO checks and text rendering for the landing page generator. No server imports. */

import { fleschReadingEase, syllables } from "@/lib/audit/text"
import { normalizeSerpBrief, parseCompetitorUrls, readingTarget, wordTarget, type SerpBrief } from "@/lib/competitor-types"
import { EMIRATES } from "@/lib/constants"
import { BadRequestError, META_DESCRIPTION_MAX, META_TITLE_MAX, parseLanguage, type Language, type Localized } from "@/lib/content-types"
import { allHeadings, cleanContent, contentWords, ctaLines, faqItems, legacyToContent, parseContent, plainText, processSteps, readableText, repeatedSentences, wordsBeforeFirstCta } from "@/lib/landing-content"

export const PAGE_TYPES = [
  { value: "service", label: "Service page", guide: "A page for one service across the target emirate. The visitor searched for this service, so lead with it and show exactly how the company delivers it." },
  { value: "area", label: "Area page", guide: "A page for the company's services in one area or community. Lead with the location and what the company does there, covering its main services rather than a single one. Use area-specific detail (access, buildings, communities, travel time) only when the company profile provides it." },
] as const
export type LandingPageType = (typeof PAGE_TYPES)[number]["value"]

export type LandingOptions = {
  primaryKeyword: string
  secondaryKeywords: string[]
  emirate: string
  /** the service a service page is for; empty on an area page */
  service: string
  /** the area an area page is for; empty on a service page */
  area: string
  pageType: LandingPageType
  /** competitor pages the brief was built from, kept for reference */
  competitorUrls: string[]
  /** what the competitor research found; null when no competitors were analyzed */
  serpBrief: SerpBrief | null
}

export const MAX_SECONDARY_KEYWORDS = 5
export const MAX_KEYWORD_LENGTH = 100

/** Which part of the page covers one of the sections the competitor analysis found: the heading of the section, or "intro". */
export type SectionCoverage = { section: string; location: string }

export type ImagePlanItem = {
  /** where on the page: intro, or the heading of the section the image sits in */
  placement: string
  /** what the photo should show, to brief the client or the photographer */
  subject: string
  filename: string
  alt: string
  /** e.g. "1600x900" */
  size: string
  loading: "eager" | "lazy"
}

export type LandingPage = {
  /** the primary keyword phrase the page actually uses (the translation, on a page written in another language) */
  keywordUsed: string
  /** the secondary keywords as the page uses them (translated, on a page written in another language) */
  secondaryUsed: string[]
  meta: { title: string; description: string; slug: string; h1: string }
  /** everything on the page below the H1 as one markdown document: intro, benefits, service, process, reviews, FAQ, call to action. See lib/landing-content.ts */
  content: string
  /** one entry for each section the competitor analysis listed, saying which part of the page covers it */
  sectionCoverage: SectionCoverage[]
  technicalSeo: { schema: string; internalLinks: { anchor: string; page: string }[] }
  imagePlan: { rationale: string; images: ImagePlanItem[] }
}

export type LandingResult = Localized<LandingPage>

/* ------------------------------------------------------------- validation */

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const list = (v: unknown) => (Array.isArray(v) ? v : [])
const strings = (v: unknown) => list(v).map(text).filter(Boolean)
const objects = (v: unknown) => list(v).filter(isObject)

export function parseLandingRequest(body: Record<string, unknown>) {
  const language = parseLanguage(body.language)
  // a page is written in one language; "both" only exists on pages saved before that was the rule
  if (language === "both") throw new BadRequestError("Choose English or Arabic.")
  return { language, options: parseLandingOptions(body.options) }
}

/** The keyword, emirate, page type and service or area fields, which the competitor analysis shares with generation. */
export function parseBriefOptions(raw: unknown): Omit<LandingOptions, "competitorUrls" | "serpBrief"> {
  const o = isObject(raw) ? raw : {}
  const primaryKeyword = text(o.primaryKeyword).replace(/\s+/g, " ")
  if (!primaryKeyword) throw new BadRequestError("Enter the primary keyword.")
  if (primaryKeyword.length > MAX_KEYWORD_LENGTH) throw new BadRequestError(`Keywords can be up to ${MAX_KEYWORD_LENGTH} characters.`)

  const given = typeof o.secondaryKeywords === "string" ? o.secondaryKeywords.split(",") : list(o.secondaryKeywords)
  const secondaryKeywords = [...new Set(given.map((k) => text(k).replace(/\s+/g, " ")).filter((k) => k && k.toLowerCase() !== primaryKeyword.toLowerCase()))]
  if (secondaryKeywords.length > MAX_SECONDARY_KEYWORDS) throw new BadRequestError(`Use up to ${MAX_SECONDARY_KEYWORDS} secondary keywords.`)
  if (secondaryKeywords.some((k) => k.length > MAX_KEYWORD_LENGTH)) throw new BadRequestError(`Keywords can be up to ${MAX_KEYWORD_LENGTH} characters.`)

  const emirate = text(o.emirate)
  if (!(EMIRATES as readonly string[]).includes(emirate)) throw new BadRequestError("Choose an emirate.")
  const pageType = PAGE_TYPES.find((p) => p.value === o.pageType)?.value
  if (!pageType) throw new BadRequestError("Choose a page type.")
  // a service page is about one service, an area page about one area: the other field is dropped
  const service = pageType === "service" ? text(o.service).slice(0, 100) : ""
  if (pageType === "service" && !service) throw new BadRequestError("Choose the service this page is for.")
  const area = pageType === "area" ? text(o.area).slice(0, 100) : ""
  if (pageType === "area" && !area) throw new BadRequestError("Choose the area this page is for.")

  return { primaryKeyword, secondaryKeywords, emirate, service, area, pageType }
}

export function parseLandingOptions(raw: unknown): LandingOptions {
  const o = isObject(raw) ? raw : {}
  return { ...parseBriefOptions(o), competitorUrls: parseCompetitorUrls(o.competitorUrls), serpBrief: normalizeSerpBrief(o.serpBrief) }
}

function normalizeImage(raw: Record<string, unknown>): ImagePlanItem {
  return {
    placement: text(raw.placement),
    subject: text(raw.subject),
    filename: text(raw.filename),
    alt: text(raw.alt),
    size: text(raw.size),
    loading: raw.loading === "eager" ? "eager" : "lazy",
  }
}

/** Coerce model output (or a stored copy) into a LandingPage; null when there is nothing usable. Pages saved with a field for each part are converted. */
export function normalizeLandingPage(raw: unknown): LandingPage | null {
  if (!isObject(raw)) return null
  const meta = isObject(raw.meta) ? raw.meta : {}
  const tech = isObject(raw.technicalSeo) ? raw.technicalSeo : {}
  const plan = isObject(raw.imagePlan) ? raw.imagePlan : {}

  let images = objects(plan.images).map(normalizeImage).filter((i) => i.filename || i.alt || i.subject)
  // pages saved before the image plan existed only had a list of alt texts
  if (!images.length && Array.isArray(tech.imageAlts)) images = strings(tech.imageAlts).map((alt) => ({ placement: "", subject: "", filename: "", alt, size: "", loading: "lazy" as const }))

  const content = typeof raw.content === "string" && raw.content.trim() ? cleanContent(raw.content) : legacyToContent(raw)
  const page: LandingPage = {
    keywordUsed: text(raw.keywordUsed),
    secondaryUsed: strings(raw.secondaryUsed),
    meta: { title: text(meta.title), description: text(meta.description), slug: text(meta.slug), h1: text(meta.h1) },
    content,
    sectionCoverage: objects(raw.sectionCoverage)
      .map((c) => ({ section: text(c.section), location: text(c.location) }))
      .filter((c) => c.section),
    technicalSeo: {
      schema: text(tech.schema),
      internalLinks: objects(tech.internalLinks)
        .map((l) => ({ anchor: text(l.anchor), page: text(l.page) }))
        .filter((l) => l.anchor || l.page),
    },
    imagePlan: { rationale: text(plan.rationale), images },
  }
  // a page with no title and no body is a failed generation, not a draft to edit
  return page.meta.title && page.content ? page : null
}

/** Validate a stored result (both languages optional, at least one present). */
export function normalizeLandingResult(raw: unknown): LandingResult | null {
  if (!isObject(raw)) return null
  const out: LandingResult = {}
  for (const lang of ["en", "ar"] as const) {
    if (raw[lang] === undefined || raw[lang] === null) continue
    const page = normalizeLandingPage(raw[lang])
    if (!page) return null
    out[lang] = page
  }
  return out.en || out.ar ? out : null
}

export const languagesOf = (language: Language): ("en" | "ar")[] => (language === "both" ? ["en", "ar"] : [language])

/* ------------------------------------------------------------ SEO checks */

export type SeoCheck = {
  id: "language" | "sections" | "title" | "description" | "h1" | "first100" | "h2" | "slug" | "alt" | "secondary" | "density" | "process" | "faq" | "cta" | "repetition" | "claims" | "images" | "imagenames" | "readability" | "length" | "placeholders"
  label: string
  /** true passes, false fails, null is informational or could not be judged */
  ok: boolean | null
  detail: string
  /** a failure here makes the generator revise the page */
  hard: boolean
}

export const MAX_DENSITY_PERCENT = 2
export const MIN_PROCESS_STEPS = 3
export const MIN_IMAGES = 3
export const MAX_ALT_LENGTH = 125
/** the first call or WhatsApp button must come within this many words, so the first screen has a way to get in touch */
export const MAX_WORDS_BEFORE_CTA = 150
/** lines with a call or WhatsApp button (a line may hold both); a button after every paragraph is noise: one in the intro and one at the end of each section is plenty */
export const MIN_CTAS = 3
export const MAX_CTAS = 12
export const MIN_FAQ = 5

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean)
const contains = (haystack: string, phrase: string) => !!phrase && normalize(haystack).includes(normalize(phrase))
export const countOf = (haystack: string, phrase: string) => (phrase ? normalize(haystack).split(normalize(phrase)).length - 1 : 0)

export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
export const isLatin = (s: string) => /^[\x20-ɏ]+$/.test(s)

export const FILLER = new Set(["in", "of", "the", "and", "for", "a", "an", "to", "near"])

/** lowercase words joined by hyphens, a known image extension */
export const IMAGE_FILENAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:webp|avif|jpg|jpeg|png)$/

export const PLACEHOLDER = /\[PLACEHOLDER:[^\]]*\]/g
export const countPlaceholders = (page: LandingPage) => (JSON.stringify(page).match(PLACEHOLDER) ?? []).length

/** The visible copy: the H1 and the body, without markdown syntax. What word counts, density and the first 100 words are measured on. */
export const bodyText = (page: LandingPage) => `${page.meta.h1}\n${plainText(page.content)}`

/** Share of the letters in the main copy that are Arabic, 0 to 1. */
function arabicShare(page: LandingPage) {
  const letters = [page.meta.title, page.meta.h1, plainText(page.content).slice(0, 2000)].join(" ").match(/\p{L}/gu) ?? []
  return letters.length ? letters.filter((l) => /[؀-ۿ]/.test(l)).length / letters.length : 0
}

/** The word target for one language: the same content takes about 15% fewer words in Arabic. */
export function scaledWordTarget(brief: SerpBrief | null | undefined, lang: "en" | "ar") {
  const t = wordTarget(brief)
  const k = lang === "ar" ? 0.85 : 1
  return { min: Math.round(t.min * k), max: Math.round(t.max * k) }
}

/** Words of visible copy: what the competitor word counts are compared with. */
export const landingWordCount = (page: LandingPage) => wordsOf(bodyText(page)).length

/** How many FAQ questions the page needs: at least 5, and as many as the ranking pages have (up to 8). */
export const faqTarget = (brief: SerpBrief | null | undefined) => Math.max(MIN_FAQ, Math.min(8, brief?.benchmark.faqMedian ?? 0))

/** What to rewrite to make the English easier to read: the longest sentences and the hardest words. */
export function readabilityHints(page: LandingPage) {
  const copy = readableText(page.content)
  const sentences = copy.split(/(?<=[.!?])\s+/).map((t) => t.trim()).filter(Boolean)
  const letters = copy.match(/[A-Za-z']+/g) ?? []
  const long = sentences
    .map((t) => ({ t, n: wordsOf(t).length }))
    .filter((x) => x.n >= 20)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((x) => x.t)
  const counts = new Map<string, number>()
  for (const w of letters) {
    const k = w.toLowerCase()
    if (syllables(k) >= 4) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const hard = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w]) => w)
  return { long, hard, averageSentence: sentences.length ? Math.round(letters.length / sentences.length) : 0 }
}

/**
 * Claims a page cannot make without proof: rankings and superlatives (Google Ads also rejects them), and what customers say, which only a
 * real review can support. English and Arabic. The keywords themselves are left out, so a keyword like "best movers" does not flag itself.
 */
const CLAIM =
  /(?:\b(?:best|top[- ]rated|top (?:villa|home|house|moving|movers|service|company|team|quality)|leading|number one|cheapest|guaranteed|unbeatable|finest|premier|world[- ]class|five[- ]star|5[- ]star|(?:customers|clients|homeowners) (?:say|tell us|love|praise|rave|rate))\b|#1)/gi

const CLAIM_AR = /(?<!\p{L})(?:أفضل|الأفضل|الأرخص|رقم واحد|رقم 1|الرائد|الرائدة)(?!\p{L})/u

export function unprovenClaims(page: LandingPage, keywords: string[]): string[] {
  let text = `${page.meta.title}\n${page.meta.description}\n${bodyText(page)}`
  for (const k of keywords.filter(Boolean)) text = text.split(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig")).join(" ")
  const found = new Set<string>()
  for (const sentence of text.split(/(?<=[.!?])\s+|\n/)) {
    CLAIM.lastIndex = 0
    const m = CLAIM.exec(sentence) ?? CLAIM_AR.exec(sentence)
    if (m) found.add(sentence.trim().length > 110 ? sentence.trim().slice(Math.max(0, m.index - 40), m.index + 70) : sentence.trim())
  }
  return [...found]
}

const MIN_SECTION_WORDS = 50
/** Sections an old page recorded as "hero", "faq"... are trusted: they were checked when the page was made. */
const LEGACY_LOCATIONS = new Set(["hero", "benefits", "service", "process", "proof", "faq", "cta"])
const resembles = (a: string, b: string) => !!a && !!b && (a.includes(b) || b.includes(a))

/** The competitor sections this page does not cover, as short problem statements. Empty when all are covered. */
export function coverageProblems(page: LandingPage, required: string[]): string[] {
  const { intro, sections } = parseContent(page.content)
  const sectionFor = (heading: string) => sections.find((s) => normalize(s.heading) === heading) ?? sections.find((s) => resembles(normalize(s.heading), heading))
  return required.flatMap((req) => {
    const want = normalize(req)
    const entry = page.sectionCoverage.find((c) => {
      const have = normalize(c.section)
      return have === want || resembles(have, want)
    })
    const where = entry ? normalize(entry.location) : ""
    if (where === "intro") return contentWords(intro) >= 30 ? [] : [`"${req}" is covered by the intro, which is too short`]
    if (entry && LEGACY_LOCATIONS.has(where)) return []
    const section = (where && sectionFor(where)) || sections.find((s) => resembles(normalize(s.heading), want))
    if (!section) return [entry ? `"${req}" is meant to be covered by the section "${entry.location}", which is not on the page` : `"${req}" is not covered by any section`]
    return section.words >= MIN_SECTION_WORDS ? [] : [`"${req}" is covered only by a ${section.words}-word section ("${section.heading}")`]
  })
}

type CheckOptions = Pick<LandingOptions, "primaryKeyword" | "secondaryKeywords"> & { serpBrief?: SerpBrief | null }

export function checkLandingPage(page: LandingPage, options: CheckOptions, lang: "en" | "ar" = "en"): SeoCheck[] {
  const primary = page.keywordUsed || options.primaryKeyword
  const body = bodyText(page)
  const total = wordsOf(body).length
  const first100 = wordsOf(body).slice(0, 100).join(" ")
  const titleLen = page.meta.title.length
  const descLen = page.meta.description.length
  const uses = countOf(body, primary)
  const density = total ? (uses / total) * 100 : 0
  const keywordSlug = slugify(primary)
  const h2s = parseContent(page.content).sections.map((s) => s.heading)
  const headings = allHeadings(page.content)
  const secondaryKeywords = page.secondaryUsed.length ? page.secondaryUsed : options.secondaryKeywords
  const secondary = secondaryKeywords.map((k) => ({ k, found: contains(body, k) }))
  const missing = secondary.filter((s) => !s.found).map((s) => s.k)
  const placeholders = countPlaceholders(page)
  const share = arabicShare(page)
  const steps = processSteps(page.content)
  const faq = faqItems(page.content)
  const faqNeeded = faqTarget(options.serpBrief)
  const ctas = ctaLines(page.content)
  const beforeCta = wordsBeforeFirstCta(page.content)
  const repeated = repeatedSentences(page.content)
  const claims = unprovenClaims(page, [primary, ...secondaryKeywords])

  const images = page.imagePlan.images
  const altsWithKeyword = images.filter((i) => contains(i.alt, primary)).length
  const badNames = images.filter((i) => !IMAGE_FILENAME.test(i.filename) || i.filename.length > 70)
  const longAlts = images.filter((i) => i.alt.length > MAX_ALT_LENGTH)
  const stuffed = images.length > 0 && altsWithKeyword > Math.max(2, Math.ceil(images.length / 3))
  // "villa-movers-sharjah-crew.webp" counts for "villa movers in Sharjah": filler words need not be in the file name
  const keywordTokens = keywordSlug.split("-").filter((t) => t && !FILLER.has(t))
  const nameHasKeyword = !isLatin(primary) || images.some((i) => keywordTokens.every((t) => i.filename.split(/[-.]/).includes(t)))

  const ease = lang === "en" ? fleschReadingEase(readableText(page.content)) : null
  const easeTarget = readingTarget(options.serpBrief)
  const target = scaledWordTarget(options.serpBrief, lang)
  const minWords = target.min
  const maxWords = Math.round(target.max * 1.15)
  const hasTarget = target.max > 0
  const required = options.serpBrief?.commonSections ?? []
  const uncovered = coverageProblems(page, required)

  return [
    ...(lang === "ar"
      ? [
          {
            id: "language" as const,
            label: "Written in Arabic, with an Arabic keyword",
            ok: share >= 0.6 && /[؀-ۿ]/.test(primary),
            detail: `${Math.round(share * 100)}% of the main copy is Arabic; keyword "${primary}"`,
            hard: true,
          },
        ]
      : []),
    {
      id: "title",
      label: "Primary keyword in the title tag",
      ok: contains(page.meta.title, primary) && titleLen <= META_TITLE_MAX,
      detail: `${titleLen}/${META_TITLE_MAX} characters${contains(page.meta.title, primary) ? "" : ", keyword missing"}`,
      hard: true,
    },
    {
      id: "description",
      label: "Primary keyword in the meta description",
      ok: contains(page.meta.description, primary) && descLen <= META_DESCRIPTION_MAX,
      detail: `${descLen}/${META_DESCRIPTION_MAX} characters${contains(page.meta.description, primary) ? "" : ", keyword missing"}`,
      hard: true,
    },
    { id: "h1", label: "Primary keyword in the H1", ok: contains(page.meta.h1, primary), detail: page.meta.h1 || "No H1", hard: true },
    { id: "first100", label: "Primary keyword in the first 100 words", ok: contains(first100, primary), detail: "", hard: true },
    {
      id: "h2",
      label: "Primary keyword in an H2",
      ok: h2s.some((h) => contains(h, primary)),
      detail: h2s.find((h) => contains(h, primary)) ?? (h2s[0] ? `Not in any of ${h2s.length} H2s, e.g. "${h2s[0]}"` : "No H2"),
      hard: true,
    },
    isLatin(primary) || /^[a-z0-9-]+$/.test(page.meta.slug)
      ? {
          id: "slug",
          label: "Primary keyword in the URL slug",
          ok: !!page.meta.slug && (!isLatin(primary) || page.meta.slug.includes(keywordSlug)),
          detail: `/${page.meta.slug}`,
          hard: true,
        }
      : { id: "slug", label: "Primary keyword in the URL slug", ok: null, detail: "Slug is not in Latin letters", hard: false },
    {
      id: "alt",
      label: "Primary keyword in an image alt text",
      ok: altsWithKeyword > 0,
      detail: `${altsWithKeyword} of ${images.length} alt texts`,
      hard: true,
    },
    {
      id: "secondary",
      label: "Secondary keywords used in the body",
      ok: secondary.length ? missing.length === 0 : null,
      detail: secondary.length ? (missing.length ? `Missing: ${missing.join(", ")}` : `${secondary.length} of ${secondary.length} used${headings.some((h) => secondary.some((s) => contains(h, s.k))) ? ", one in a heading" : ""}`) : "No secondary keywords given",
      hard: true,
    },
    {
      id: "density",
      label: `Keyword density under ${MAX_DENSITY_PERCENT}%`,
      ok: density < MAX_DENSITY_PERCENT && uses > 0,
      detail: `${uses} uses in ${total} words (${density.toFixed(1)}%)`,
      hard: true,
    },
    {
      id: "process",
      label: `Process section with ${MIN_PROCESS_STEPS}+ steps`,
      ok: steps.length >= MIN_PROCESS_STEPS,
      detail: `${steps.length} steps`,
      hard: true,
    },
    {
      id: "faq",
      label: `FAQ with ${faqNeeded}+ questions`,
      ok: faq.length >= faqNeeded,
      detail: `${faq.length} questions${options.serpBrief?.benchmark.faqMedian ? `; ranking pages: ${options.serpBrief.benchmark.faqMedian}` : ""}`,
      hard: true,
    },
    {
      id: "cta",
      label: "Call and WhatsApp buttons, from the first screen on",
      ok: ctas >= MIN_CTAS && ctas <= MAX_CTAS && beforeCta !== null && beforeCta <= MAX_WORDS_BEFORE_CTA,
      detail: ctas ? `${ctas} lines with buttons (${MIN_CTAS} to ${MAX_CTAS}); the first after ${beforeCta} words` : "No call or WhatsApp button in the copy",
      hard: true,
    },
    {
      id: "repetition",
      label: "No sentence repeated on the page",
      ok: repeated.length === 0,
      detail: repeated.length ? `${repeated.length} repeated, e.g. "${repeated[0].slice(0, 70)}…"` : "Every sentence is new",
      hard: true,
    },
    {
      id: "claims",
      label: "No unproven claims (best, top, leading, what customers say)",
      ok: claims.length === 0,
      detail: claims.length ? `${claims.length} found, e.g. "${claims[0]}"` : "None found",
      hard: true,
    },
    {
      id: "images",
      label: "Image plan with file names and alt text",
      ok: images.length >= MIN_IMAGES && images.every((i) => i.filename && i.alt),
      detail: `${images.length} images planned`,
      hard: true,
    },
    {
      id: "imagenames",
      label: "Clean file names, short alt texts, no keyword stuffing",
      ok: badNames.length === 0 && longAlts.length === 0 && !stuffed && nameHasKeyword,
      detail: [
        badNames.length && `${badNames.length} file name${badNames.length === 1 ? "" : "s"} not lowercase-hyphenated`,
        longAlts.length && `${longAlts.length} alt text${longAlts.length === 1 ? "" : "s"} over ${MAX_ALT_LENGTH} characters`,
        stuffed && "keyword in too many alt texts",
        !nameHasKeyword && "no file name contains the keyword",
      ]
        .filter(Boolean)
        .join("; ") || "File names and alt texts look right",
      hard: true,
    },
    {
      id: "readability",
      label: `Plain English (reading ease ${easeTarget}+)`,
      ok: lang !== "en" || ease === null ? null : ease >= easeTarget,
      detail: lang !== "en" ? "Checked for English pages only" : ease === null ? "Not enough text to measure" : `Reading ease ${ease}${options.serpBrief?.benchmark.readingEaseMedian != null ? `; ranking pages: ${options.serpBrief.benchmark.readingEaseMedian}` : ""}`,
      hard: true,
    },
    {
      id: "length",
      label: "Length matches or beats the pages that rank",
      ok: hasTarget ? total >= minWords && total <= maxWords : null,
      detail: hasTarget ? `${total} words; target ${target.min}-${target.max}` : `${total} words; analyze competitors for a target`,
      hard: true,
    },
    {
      id: "sections",
      label: "Includes the sections the ranking pages share",
      ok: required.length ? uncovered.length === 0 : null,
      detail: required.length ? (uncovered.length ? uncovered.join("; ") : `${required.length} of ${required.length} covered`) : "Analyze competitors to see the shared sections",
      hard: true,
    },
    {
      id: "placeholders",
      label: "Facts to fill in or confirm",
      ok: placeholders === 0 ? true : null,
      detail: placeholders === 0 ? "None" : `${placeholders} [PLACEHOLDER] marker${placeholders === 1 ? "" : "s"} to replace`,
      hard: false,
    },
  ]
}

export const failedHardChecks = (checks: SeoCheck[]) => checks.filter((c) => c.hard && c.ok === false)

/* ---------------------------------------------------------------- markdown */

export type LandingSection = "meta" | "content" | "technical" | "images"

export const LANDING_SECTIONS: { id: LandingSection; label: string }[] = [
  { id: "meta", label: "Meta & SEO" },
  { id: "content", label: "Page Content" },
  { id: "technical", label: "Technical SEO" },
  { id: "images", label: "Image Plan" },
]

export function sectionMarkdown(page: LandingPage, section: LandingSection): string {
  switch (section) {
    case "meta":
      return [`- **Title tag:** ${page.meta.title}`, `- **Meta description:** ${page.meta.description}`, `- **URL slug:** /${page.meta.slug}`, `- **H1:** ${page.meta.h1}`].join("\n")
    case "content":
      return [`# ${page.meta.h1}`, page.content].join("\n\n")
    case "technical":
      return [
        "### Schema markup (JSON-LD)",
        "```json\n" + page.technicalSeo.schema + "\n```",
        "### Internal links",
        page.technicalSeo.internalLinks.map((l) => `- ${l.anchor} → ${l.page}`).join("\n") || "None suggested",
      ].join("\n\n")
    case "images":
      return [
        `**${page.imagePlan.images.length} images.** ${page.imagePlan.rationale}`,
        "| # | Placement | File name | Alt text | Size | Loading | What to photograph |",
        "|---|---|---|---|---|---|---|",
        ...page.imagePlan.images.map((i, n) => `| ${n + 1} | ${i.placement} | \`${i.filename}\` | ${i.alt} | ${i.size} | ${i.loading} | ${i.subject} |`),
      ].join("\n")
  }
}

/** The whole page as Markdown: meta tags, the content under its H1, technical SEO and the image plan. */
export function landingMarkdown(page: LandingPage) {
  return LANDING_SECTIONS.map((s) => sectionMarkdown(page, s.id)).join("\n\n---\n\n") + "\n"
}
