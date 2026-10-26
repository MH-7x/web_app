/** Types, validation, SEO checks and text rendering for the landing page generator. No server imports. */

import { fleschReadingEase, syllables } from "@/lib/audit/text"
import { normalizeSerpBrief, parseCompetitorUrls, readingTarget, wordTarget, type SerpBrief } from "@/lib/competitor-types"
import { EMIRATES } from "@/lib/constants"
import { BadRequestError, META_DESCRIPTION_MAX, META_TITLE_MAX, parseLanguage, type Language, type Localized } from "@/lib/content-types"

export const PAGE_TYPES = [
  { value: "service", label: "Service page", guide: "A page for one service across the target emirate. The visitor searched for this service, so lead with it and show exactly how the company delivers it." },
  { value: "area", label: "Area page", guide: "A page for the service in one location. Lead with the location and the service together, and use area-specific detail (access, buildings, communities, travel time) only when the company profile provides it." },
  { value: "offer", label: "Offer page", guide: "A page for a specific offer or promotion. Lead with the offer. Use only the offer terms given in the company profile; where they are missing, write [PLACEHOLDER: add your offer details]." },
] as const
export type LandingPageType = (typeof PAGE_TYPES)[number]["value"]

export type LandingOptions = {
  primaryKeyword: string
  secondaryKeywords: string[]
  emirate: string
  service: string
  pageType: LandingPageType
  /** competitor pages the brief was built from, kept for reference */
  competitorUrls: string[]
  /** what the competitor research found; null when no competitors were analyzed */
  serpBrief: SerpBrief | null
}

export const MAX_SECONDARY_KEYWORDS = 5
export const MAX_KEYWORD_LENGTH = 100

export type ProcessStep = {
  title: string
  description: string
  /** the step was proposed by the AI rather than taken from the company profile, so the client must confirm it */
  confirm: boolean
}

/** Where an additional section sits: after the service details, after the process, or after the social proof. */
export type ExtraPlacement = "service" | "process" | "proof"

/** A section the ranking pages have that the fixed layout does not: accreditations, areas covered, guides, extra services... */
export type ExtraSection = { heading: string; paragraphs: string[]; placement: ExtraPlacement }

/** Which part of the page covers one of the sections the competitor analysis found. */
export type SectionCoverage = { section: string; location: string }

/** The fixed sections a competitor section can be covered by. Anything else is an additional section's heading. */
export const FIXED_LOCATIONS = ["hero", "benefits", "service", "process", "proof", "faq", "cta"] as const

export type ImagePlanItem = {
  /** where on the page: hero, benefits, service, process, proof or cta */
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
  hero: { headline: string; subheadline: string; cta: string; trustBadges: string[] }
  headings: { benefits: string; service: string; process: string; socialProof: string; faq: string }
  benefits: { icon: string; heading: string; description: string }[]
  serviceDetails: string[]
  process: ProcessStep[]
  additionalSections: ExtraSection[]
  /** one entry for each section the competitor analysis listed, saying where this page covers it */
  sectionCoverage: SectionCoverage[]
  socialProof: { testimonials: { quote: string; name: string; detail: string }[]; stats: { value: string; label: string }[] }
  faq: { question: string; answer: string }[]
  cta: { headline: string; description: string; phoneButton: string; whatsappButton: string }
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
  return { language: parseLanguage(body.language), options: parseLandingOptions(body.options) }
}

/** The keyword, emirate, service and page type fields, which the competitor analysis shares with generation. */
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
  const service = text(o.service).slice(0, 100)
  if (!service) throw new BadRequestError("Choose the service this page is for.")
  const pageType = PAGE_TYPES.find((p) => p.value === o.pageType)?.value
  if (!pageType) throw new BadRequestError("Choose a page type.")

  return { primaryKeyword, secondaryKeywords, emirate, service, pageType }
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

/** Coerce model output (or a stored copy) into a LandingPage; null when there is nothing usable. */
export function normalizeLandingPage(raw: unknown): LandingPage | null {
  if (!isObject(raw)) return null
  const meta = isObject(raw.meta) ? raw.meta : {}
  const hero = isObject(raw.hero) ? raw.hero : {}
  const headings = isObject(raw.headings) ? raw.headings : {}
  const proof = isObject(raw.socialProof) ? raw.socialProof : {}
  const cta = isObject(raw.cta) ? raw.cta : {}
  const tech = isObject(raw.technicalSeo) ? raw.technicalSeo : {}
  const plan = isObject(raw.imagePlan) ? raw.imagePlan : {}

  let images = objects(plan.images).map(normalizeImage).filter((i) => i.filename || i.alt || i.subject)
  // pages saved before the image plan existed only had a list of alt texts
  if (!images.length && Array.isArray(tech.imageAlts)) images = strings(tech.imageAlts).map((alt) => ({ placement: "", subject: "", filename: "", alt, size: "", loading: "lazy" as const }))

  const page: LandingPage = {
    keywordUsed: text(raw.keywordUsed),
    secondaryUsed: strings(raw.secondaryUsed),
    meta: { title: text(meta.title), description: text(meta.description), slug: text(meta.slug), h1: text(meta.h1) },
    hero: { headline: text(hero.headline), subheadline: text(hero.subheadline), cta: text(hero.cta), trustBadges: strings(hero.trustBadges) },
    headings: { benefits: text(headings.benefits), service: text(headings.service), process: text(headings.process), socialProof: text(headings.socialProof), faq: text(headings.faq) },
    benefits: objects(raw.benefits)
      .map((b) => ({ icon: text(b.icon), heading: text(b.heading), description: text(b.description) }))
      .filter((b) => b.heading || b.description),
    serviceDetails: strings(raw.serviceDetails),
    process: objects(raw.process)
      .map((s) => ({ title: text(s.title), description: text(s.description), confirm: s.confirm === true }))
      .filter((s) => s.title || s.description),
    additionalSections: objects(raw.additionalSections)
      .map((e) => ({ heading: text(e.heading), paragraphs: strings(e.paragraphs), placement: (e.placement === "service" || e.placement === "proof" ? e.placement : "process") as ExtraPlacement }))
      .filter((e) => e.heading || e.paragraphs.length),
    sectionCoverage: objects(raw.sectionCoverage)
      .map((c) => ({ section: text(c.section), location: text(c.location) }))
      .filter((c) => c.section),
    socialProof: {
      testimonials: objects(proof.testimonials)
        .map((t) => ({ quote: text(t.quote), name: text(t.name), detail: text(t.detail) }))
        .filter((t) => t.quote),
      stats: objects(proof.stats)
        .map((s) => ({ value: text(s.value), label: text(s.label) }))
        .filter((s) => s.value || s.label),
    },
    faq: objects(raw.faq)
      .map((f) => ({ question: text(f.question), answer: text(f.answer) }))
      .filter((f) => f.question && f.answer),
    cta: { headline: text(cta.headline), description: text(cta.description), phoneButton: text(cta.phoneButton), whatsappButton: text(cta.whatsappButton) },
    technicalSeo: {
      schema: text(tech.schema),
      internalLinks: objects(tech.internalLinks)
        .map((l) => ({ anchor: text(l.anchor), page: text(l.page) }))
        .filter((l) => l.anchor || l.page),
    },
    imagePlan: { rationale: text(plan.rationale), images },
  }
  // a page with no hero and no body is a failed generation, not a draft to edit
  return page.meta.title && page.hero.headline && page.serviceDetails.length ? page : null
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
  id: "language" | "sections" | "title" | "description" | "h1" | "first100" | "h2" | "slug" | "alt" | "secondary" | "density" | "process" | "images" | "imagenames" | "readability" | "length" | "placeholders"
  label: string
  /** true passes, false fails, null is informational or could not be judged */
  ok: boolean | null
  detail: string
  /** a failure here makes the generator try once more */
  hard: boolean
}

export const MAX_DENSITY_PERCENT = 2
export const MIN_PROCESS_STEPS = 3
export const MIN_IMAGES = 3
export const MAX_ALT_LENGTH = 125

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean)
const contains = (haystack: string, phrase: string) => !!phrase && normalize(haystack).includes(normalize(phrase))
const countOf = (haystack: string, phrase: string) => (phrase ? normalize(haystack).split(normalize(phrase)).length - 1 : 0)

export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
const isLatin = (s: string) => /^[\x20-ɏ]+$/.test(s)

const FILLER = new Set(["in", "of", "the", "and", "for", "a", "an", "to", "near"])

/** lowercase words joined by hyphens, a known image extension */
export const IMAGE_FILENAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:webp|avif|jpg|jpeg|png)$/

export const PLACEHOLDER = /\[PLACEHOLDER:[^\]]*\]/g
export const countPlaceholders = (page: LandingPage) => (JSON.stringify(page).match(PLACEHOLDER) ?? []).length
export const countUnconfirmedSteps = (page: LandingPage) => page.process.filter((s) => s.confirm).length

const extraBlocks = (page: LandingPage, slot: ExtraPlacement) => page.additionalSections.filter((e) => e.placement === slot).flatMap((e) => [e.heading, ...e.paragraphs])

/** The visible copy in page order, one string per block. */
function bodyBlocks(page: LandingPage) {
  return [
    page.meta.h1,
    page.hero.headline,
    page.hero.subheadline,
    page.hero.cta,
    ...page.hero.trustBadges,
    page.headings.benefits,
    ...page.benefits.flatMap((b) => [b.heading, b.description]),
    page.headings.service,
    ...page.serviceDetails,
    ...extraBlocks(page, "service"),
    page.headings.process,
    ...page.process.flatMap((s) => [s.title, s.description]),
    ...extraBlocks(page, "process"),
    page.headings.socialProof,
    ...page.socialProof.testimonials.map((t) => t.quote),
    ...page.socialProof.stats.map((s) => `${s.value} ${s.label}`),
    ...extraBlocks(page, "proof"),
    page.headings.faq,
    ...page.faq.flatMap((f) => [f.question, f.answer]),
    page.cta.headline,
    page.cta.description,
  ].filter(Boolean)
}

/** Share of the letters in the main copy that are Arabic, 0 to 1. */
function arabicShare(page: LandingPage) {
  const letters = [page.meta.title, page.meta.h1, page.hero.headline, page.hero.subheadline, ...page.serviceDetails].join(" ").match(/\p{L}/gu) ?? []
  return letters.length ? letters.filter((l) => /[؀-ۿ]/.test(l)).length / letters.length : 0
}

/** The word target for one language: the same content takes about 15% fewer words in Arabic. */
export function scaledWordTarget(brief: SerpBrief | null | undefined, lang: "en" | "ar") {
  const t = wordTarget(brief)
  const k = lang === "ar" ? 0.85 : 1
  return { min: Math.round(t.min * k), max: Math.round(t.max * k) }
}

/** Words of visible copy: what the competitor word counts are compared with. */
export const landingWordCount = (page: LandingPage) => wordsOf(bodyBlocks(page).join("\n")).length

/** The sentences the reading ease is measured on: every paragraph of running copy, each ended with a full stop. */
function readableCopy(page: LandingPage) {
  return [page.hero.subheadline, ...page.serviceDetails, ...page.benefits.map((b) => b.description), ...page.process.map((st) => st.description), ...page.additionalSections.flatMap((e) => e.paragraphs), ...page.faq.map((f) => f.answer), page.cta.description]
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (/[.!?؟]$/.test(t) ? t : t + "."))
    .join(" ")
}

/** What to rewrite to make the English easier to read: the longest sentences and the hardest words. */
export function readabilityHints(page: LandingPage) {
  const copy = readableCopy(page)
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

/** The competitor sections this page does not cover, as short problem statements. Empty when all are covered. */
export function coverageProblems(page: LandingPage, required: string[]): string[] {
  const headings = page.additionalSections.map((e) => normalize(e.heading))
  return required.flatMap((req) => {
    const want = normalize(req)
    const entry = page.sectionCoverage.find((c) => {
      const have = normalize(c.section)
      return have === want || have.includes(want) || want.includes(have)
    })
    if (!entry) return [`"${req}" is not listed in sectionCoverage`]
    const where = normalize(entry.location)
    if ((FIXED_LOCATIONS as readonly string[]).includes(where) || headings.includes(where)) return []
    return [`"${req}" points to "${entry.location}", which is neither a fixed section nor the heading of one of your additional sections`]
  })
}

type CheckOptions = Pick<LandingOptions, "primaryKeyword" | "secondaryKeywords"> & { serpBrief?: SerpBrief | null }

export function checkLandingPage(page: LandingPage, options: CheckOptions, lang: "en" | "ar" = "en"): SeoCheck[] {
  const primary = page.keywordUsed || options.primaryKeyword
  const blocks = bodyBlocks(page)
  const body = blocks.join("\n")
  const total = wordsOf(body).length
  const first100 = wordsOf(body).slice(0, 100).join(" ")
  const titleLen = page.meta.title.length
  const descLen = page.meta.description.length
  const uses = countOf(body, primary)
  const density = total ? (uses / total) * 100 : 0
  const keywordSlug = slugify(primary)
  const h2s = [page.headings.service, page.headings.benefits, page.headings.process, page.headings.socialProof, page.headings.faq, ...page.additionalSections.map((e) => e.heading)].filter(Boolean)
  const secondaryKeywords = page.secondaryUsed.length ? page.secondaryUsed : options.secondaryKeywords
  const secondary = secondaryKeywords.map((k) => ({ k, found: contains(body, k) }))
  const missing = secondary.filter((s) => !s.found).map((s) => s.k)
  const placeholders = countPlaceholders(page)
  const unconfirmed = countUnconfirmedSteps(page)
  const share = arabicShare(page)

  const images = page.imagePlan.images
  const altsWithKeyword = images.filter((i) => contains(i.alt, primary)).length
  const badNames = images.filter((i) => !IMAGE_FILENAME.test(i.filename) || i.filename.length > 70)
  const longAlts = images.filter((i) => i.alt.length > MAX_ALT_LENGTH)
  const stuffed = images.length > 0 && altsWithKeyword > Math.max(2, Math.ceil(images.length / 3))
  // "villa-movers-sharjah-crew.webp" counts for "villa movers in Sharjah": filler words need not be in the file name
  const keywordTokens = keywordSlug.split("-").filter((t) => t && !FILLER.has(t))
  const nameHasKeyword = !isLatin(primary) || images.some((i) => keywordTokens.every((t) => i.filename.split(/[-.]/).includes(t)))

  const ease = lang === "en" ? fleschReadingEase(readableCopy(page)) : null
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
      detail: h2s.find((h) => contains(h, primary)) ?? (h2s[0] ? `Not in any of ${h2s.length} H2s, e.g. "${page.headings.service || h2s[0]}"` : "No H2"),
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
      detail: secondary.length ? (missing.length ? `Missing: ${missing.join(", ")}` : `${secondary.length} of ${secondary.length} used`) : "No secondary keywords given",
      hard: false,
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
      ok: page.process.length >= MIN_PROCESS_STEPS && !!page.headings.process,
      detail: `${page.process.length} steps${unconfirmed ? `, ${unconfirmed} to confirm with the client` : ""}`,
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
      hard: false,
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
      ok: placeholders === 0 && unconfirmed === 0 ? true : null,
      detail:
        placeholders === 0 && unconfirmed === 0
          ? "None"
          : [placeholders && `${placeholders} [PLACEHOLDER] marker${placeholders === 1 ? "" : "s"} to replace`, unconfirmed && `${unconfirmed} process step${unconfirmed === 1 ? "" : "s"} to confirm with the client`].filter(Boolean).join("; "),
      hard: false,
    },
  ]
}

export const failedHardChecks = (checks: SeoCheck[]) => checks.filter((c) => c.hard && c.ok === false)

/* ---------------------------------------------------------------- markdown */

export type LandingSection = "meta" | "hero" | "benefits" | "service" | "process" | "extra" | "proof" | "faq" | "cta" | "technical" | "images"

export const LANDING_SECTIONS: { id: LandingSection; label: string }[] = [
  { id: "meta", label: "Meta & SEO" },
  { id: "hero", label: "Hero" },
  { id: "benefits", label: "Benefits" },
  { id: "service", label: "Service Details" },
  { id: "process", label: "Process" },
  { id: "extra", label: "Additional Sections" },
  { id: "proof", label: "Social Proof" },
  { id: "faq", label: "FAQ" },
  { id: "cta", label: "Call to Action" },
  { id: "technical", label: "Technical SEO" },
  { id: "images", label: "Image Plan" },
]

export function sectionMarkdown(page: LandingPage, section: LandingSection): string {
  switch (section) {
    case "meta":
      return [`- **Title tag:** ${page.meta.title}`, `- **Meta description:** ${page.meta.description}`, `- **URL slug:** /${page.meta.slug}`, `- **H1:** ${page.meta.h1}`].join("\n")
    case "hero":
      return [`# ${page.meta.h1}`, `**${page.hero.headline}**`, page.hero.subheadline, `[${page.hero.cta}]`, page.hero.trustBadges.length ? `Trust badges: ${page.hero.trustBadges.join(" | ")}` : ""].filter(Boolean).join("\n\n")
    case "benefits":
      return [`## ${page.headings.benefits}`, ...page.benefits.map((b) => `### ${b.heading}\n_Icon: ${b.icon}_\n\n${b.description}`)].join("\n\n")
    case "service":
      return [`## ${page.headings.service}`, ...page.serviceDetails].join("\n\n")
    case "process":
      return [`## ${page.headings.process}`, ...page.process.map((s, i) => `${i + 1}. **${s.title}**${s.confirm ? " _(confirm with client)_" : ""}\n   ${s.description}`)].join("\n\n")
    case "extra":
      return [
        ...page.additionalSections.map((e) => [`## ${e.heading}`, ...e.paragraphs].join("\n\n")),
        page.sectionCoverage.length ? "**Where the sections the ranking pages share are covered:**\n" + page.sectionCoverage.map((c) => `- ${c.section} → ${c.location}`).join("\n") : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    case "proof":
      return [
        `## ${page.headings.socialProof}`,
        page.socialProof.stats.length ? page.socialProof.stats.map((s) => `- **${s.value}** ${s.label}`).join("\n") : "",
        ...page.socialProof.testimonials.map((t) => `> ${t.quote}\n>\n> ${[t.name, t.detail].filter(Boolean).join(", ")}`),
      ]
        .filter(Boolean)
        .join("\n\n")
    case "faq":
      return [`## ${page.headings.faq}`, ...page.faq.map((f) => `### ${f.question}\n${f.answer}`)].join("\n\n")
    case "cta":
      return [`## ${page.cta.headline}`, page.cta.description, `[${page.cta.phoneButton}] [${page.cta.whatsappButton}]`].join("\n\n")
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

/** The whole page as Markdown, with each additional section where it sits on the page. */
export function landingMarkdown(page: LandingPage) {
  const extras = (slot: ExtraPlacement) => page.additionalSections.filter((e) => e.placement === slot).map((e) => [`## ${e.heading}`, ...e.paragraphs].join("\n\n"))
  const parts = [
    sectionMarkdown(page, "meta"),
    sectionMarkdown(page, "hero"),
    sectionMarkdown(page, "benefits"),
    sectionMarkdown(page, "service"),
    ...extras("service"),
    sectionMarkdown(page, "process"),
    ...extras("process"),
    sectionMarkdown(page, "proof"),
    ...extras("proof"),
    sectionMarkdown(page, "faq"),
    sectionMarkdown(page, "cta"),
    sectionMarkdown(page, "technical"),
    sectionMarkdown(page, "images"),
  ]
  return parts.join("\n\n---\n\n") + "\n"
}
