import { SchemaType, type ResponseSchema } from "@google/generative-ai"

import { formatPhone } from "@/lib/client-schema"
import type { ClientDetail } from "@/lib/clients"
import { briefAsText, readingTarget } from "@/lib/competitor-types"
import { META_DESCRIPTION_MAX, META_TITLE_MAX, type Language } from "@/lib/content-types"
import { GeminiError, generateJSON, generateText } from "@/lib/gemini"
import { fleschReadingEase } from "@/lib/audit/text"
import { cleanContent, contentWords, ctaLines, limitCtas, longSentences, parseContent, plainText, readableText, replaceSectionBody, stripInventedQuotes } from "@/lib/landing-content"
import { betterThan, buildRequirements, gapReport, pageRank, type OutlineItem, type Phrases, type Requirements } from "@/lib/landing-requirements"
import {
  FILLER,
  MAX_ALT_LENGTH,
  MAX_CTAS,
  MIN_IMAGES,
  PAGE_TYPES,
  checkLandingPage,
  isLatin,
  landingWordCount,
  languagesOf,
  slugify,
  type ImagePlanItem,
  type LandingOptions,
  type LandingPage,
  type LandingResult,
} from "@/lib/landing-page-types"
import { AI_WRITING_PATTERNS } from "@/lib/prompts/humanizer"
import { LANGUAGE_RULE, NO_INVENTING, categoryContext, clientBrief, tone, type Lang } from "@/lib/prompts/shared"
import { loadTemplate } from "@/lib/prompts/store"

export type LandingRequest = LandingOptions & { language: Language }

/**
 * How a landing page is made, one language at a time:
 *  1. requirements: the numbers the page must meet, worked out in code from the keywords and the competitor analysis
 *  2. plan (model): angle, meta tags, intro, every H2 section with its word budget and keywords, process, FAQ, images
 *  3. write (model): the whole body as one markdown document, from the plan
 *  4. audit (code): the SEO checks, plus sections that are missing or thinner than planned, written up as a gap report
 *  5. revise (model): rewrite the body to fix the gap report, up to twice, keeping the best draft
 *  6. repair (code): title, description, slug, file names and alt texts are fitted to their rules; the schema is built from the client's details
 */

/* ----------------------------------------------------------------- schema */

const text: ResponseSchema = { type: SchemaType.STRING }
const int: ResponseSchema = { type: SchemaType.INTEGER }
const bool: ResponseSchema = { type: SchemaType.BOOLEAN }
const list = (items: ResponseSchema): ResponseSchema => ({ type: SchemaType.ARRAY, items })
const object = (properties: Record<string, ResponseSchema>): ResponseSchema => ({ type: SchemaType.OBJECT, properties, required: Object.keys(properties) })

const PLAN_SCHEMA = object({
  intent: text,
  messageMatch: text,
  angle: text,
  proofPoints: list(text),
  missingFacts: list(text),
  keywords: object({ primary: text, secondary: list(text) }),
  meta: object({ title: text, description: text, slug: text, h1: text }),
  intro: object({ purpose: text, keyPoints: list(text), words: int }),
  outline: list(object({ heading: text, kind: text, purpose: text, keyPoints: list(text), words: int, covers: list(text), secondary: list(text) })),
  processSteps: list(object({ title: text, detail: text, needsConfirmation: bool })),
  faqPlan: list(object({ question: text, keywordVariant: text })),
  images: list(object({ placement: text, subject: text, filename: text, alt: text })),
  imageReasoning: text,
  internalLinks: list(object({ anchor: text, page: text })),
})

/* -------------------------------------------------------------------- plan */

type Meta = LandingPage["meta"]

/** The step-one plan after it has been read and completed in code. */
type Plan = {
  keywords: Phrases
  meta: Meta
  intro: { purpose: string; keyPoints: string[]; words: number }
  /** the shared competitor sections the intro covers */
  introCovers: string[]
  outline: OutlineItem[]
  images: Omit<ImagePlanItem, "size" | "loading">[]
  imageReasoning: string
  internalLinks: { anchor: string; page: string }[]
  /** the parts the writer is shown: the plan without the meta tags, images and links */
  forWriter: Record<string, unknown>
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const arr = (v: unknown) => (Array.isArray(v) ? v : [])
const strs = (v: unknown) => arr(v).map(str).filter(Boolean)
const objs = (v: unknown) => arr(v).filter(isObject)
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
const resembles = (a: string, b: string) => !!a && !!b && (a.includes(b) || b.includes(a))

const KINDS = ["section", "process", "proof", "faq", "cta"]
const INTRO_LIKE = /introduc|overview|welcome|مقدمة|نظرة عامة/i
const DEFAULT_HEADING: Record<"process" | "proof" | "faq" | "cta", Record<Lang, string>> = {
  process: { en: "How It Works", ar: "كيف نعمل" },
  proof: { en: "What Our Customers Say", ar: "آراء عملائنا" },
  faq: { en: "Frequently Asked Questions", ar: "الأسئلة الشائعة" },
  cta: { en: "Get Your Free Quote", ar: "احصل على عرض سعر مجاني" },
}

/** Read the model's plan and fill what it left out: every shared competitor section covered, the four fixed sections present, budgets that add up. */
function normalizePlan(raw: unknown, req: Requirements, options: LandingOptions, lang: Lang): Plan {
  const p = isObject(raw) ? raw : {}
  const kw = isObject(p.keywords) ? p.keywords : {}
  // an English page uses the keywords exactly as given; an Arabic page uses the translations the plan chose
  const phrases: Phrases =
    lang === "en"
      ? { primary: options.primaryKeyword, secondary: options.secondaryKeywords }
      : { primary: str(kw.primary) || options.primaryKeyword, secondary: strs(kw.secondary).length ? strs(kw.secondary) : options.secondaryKeywords }

  const m = isObject(p.meta) ? p.meta : {}
  const intro = isObject(p.intro) ? p.intro : {}
  let outline: OutlineItem[] = objs(p.outline)
    .map((o) => ({
      heading: str(o.heading).replace(/^#+\s*/, ""),
      kind: KINDS.includes(str(o.kind)) ? str(o.kind) : "section",
      purpose: str(o.purpose),
      keyPoints: strs(o.keyPoints),
      words: Math.min(900, Math.max(40, Math.round(Number(o.words) || 150))),
      covers: strs(o.covers),
      secondary: strs(o.secondary),
    }))
    .filter((o) => o.heading)

  // the intro already is the introduction and overview: a section of that name would only repeat it, so its words go to the intro
  const folded = outline.filter((o) => o.kind === "section" && INTRO_LIKE.test(o.heading)).reduce((n, o) => n + o.words, 0)
  outline = outline.filter((o) => !(o.kind === "section" && INTRO_LIKE.test(o.heading)))

  const add = (kind: keyof typeof DEFAULT_HEADING, words: number) => {
    if (outline.some((o) => o.kind === kind)) return
    const item: OutlineItem = { heading: DEFAULT_HEADING[kind][lang], kind, purpose: "", keyPoints: [], words, covers: [], secondary: [] }
    const cta = outline.findIndex((o) => o.kind === "cta")
    // keep the usual order: process, proof, faq, then the closing call to action
    if (kind === "cta" || cta < 0) outline.push(item)
    else outline.splice(cta, 0, item)
  }
  add("process", 160)
  add("proof", 120)
  add("faq", 300)
  add("cta", 60)
  // the closing call to action is always last
  outline = [...outline.filter((o) => o.kind !== "cta"), ...outline.filter((o) => o.kind === "cta").slice(0, 1)]

  // every section the ranking pages share is covered by an item, or by the intro
  const introCovers: string[] = []
  for (const section of req.requiredSections) {
    const want = norm(section)
    if (INTRO_LIKE.test(section)) {
      // the intro is always on the page, so an introduction or overview is covered there, not by a section named after something else
      for (const o of outline) o.covers = o.covers.filter((c) => !resembles(norm(c), want))
      introCovers.push(section)
      continue
    }
    const covered = outline.some((o) => o.covers.some((c) => resembles(norm(c), want)) || resembles(norm(o.heading), want))
    if (covered) continue
    const cta = outline.findIndex((o) => o.kind === "cta")
    const item: OutlineItem = { heading: section, kind: "section", purpose: "Covers a section the ranking pages share", keyPoints: [], words: 160, covers: [section], secondary: [] }
    if (cta < 0) outline.push(item)
    else outline.splice(cta, 0, item)
  }
  // every secondary keyword has a home
  for (const [i, k] of phrases.secondary.entries()) {
    if (!outline.some((o) => o.secondary.some((s) => norm(s) === norm(k)))) {
      const sections = outline.filter((o) => o.kind === "section" || o.kind === "proof")
      const home = sections[i % Math.max(1, sections.length)] ?? outline[0]
      if (home) home.secondary = [...home.secondary, k]
    }
  }

  // budgets add up to the middle of the target range, so a writer that comes in a little short still lands inside it
  const introWords = Math.min(250, Math.max(80, Math.round(Number(intro.words) || 130) + Math.round(folded / 2)))
  const wanted = Math.round((req.words.aim + req.words.max) / 2)
  const total = introWords + outline.reduce((n, o) => n + o.words, 0)
  const scale = total > 0 && Math.abs(total - wanted) / wanted > 0.1 ? wanted / total : 1
  const scaled = outline.map((o) => ({ ...o, words: Math.max(o.kind === "cta" ? 60 : 100, Math.round(o.words * scale)) }))

  const images = objs(p.images)
    .map((i) => ({ placement: str(i.placement), subject: str(i.subject), filename: str(i.filename), alt: str(i.alt) }))
    .filter((i) => i.filename || i.alt || i.subject)
  // a plan with almost no images still gets a usable set: one per section, described by its heading
  for (const o of scaled) {
    if (images.length >= Math.min(req.images, MIN_IMAGES)) break
    images.push({ placement: o.heading, subject: `A real photo from the client's own work for the section "${o.heading}"`, filename: "", alt: o.heading })
  }

  const forWriter = {
    intent: str(p.intent),
    messageMatch: str(p.messageMatch),
    angle: str(p.angle),
    proofPoints: strs(p.proofPoints),
    missingFacts: strs(p.missingFacts),
    keywords: phrases,
    intro: { purpose: str(intro.purpose), keyPoints: strs(intro.keyPoints), words: Math.round(introWords * scale) },
    outline: scaled.map((o) => ({ heading: o.heading, kind: o.kind, words: o.words, purpose: o.purpose, keyPoints: o.keyPoints, secondaryKeywords: o.secondary })),
    processSteps: objs(p.processSteps).map((s) => ({ title: str(s.title), detail: str(s.detail), needsConfirmation: s.needsConfirmation === true })),
    faqPlan: objs(p.faqPlan).map((f) => ({ question: str(f.question), keywordVariant: str(f.keywordVariant) })),
  }

  return {
    keywords: phrases,
    meta: { title: str(m.title), description: str(m.description), slug: str(m.slug), h1: str(m.h1) },
    intro: { purpose: str(intro.purpose), keyPoints: strs(intro.keyPoints), words: Math.round(introWords * scale) },
    introCovers,
    outline: scaled,
    images,
    imageReasoning: str(p.imageReasoning),
    internalLinks: objs(p.internalLinks)
      .map((l) => ({ anchor: str(l.anchor), page: str(l.page) }))
      .filter((l) => l.anchor || l.page)
      .slice(0, 5),
    forWriter,
  }
}

/* ----------------------------------------------------------------- prompts */

const NO_PROFILE = "(No company profile has been added for this client. Treat every company-specific fact as missing and use [PLACEHOLDER: add your X] markers.)"
const NO_PLAN = "(No plan is available. Decide the structure yourself: an intro, then H2 sections for the benefits, the service in detail, the process, reviews, the FAQ and a closing call to action, sized to the requirements.)"

/** Variables shared by the planning, writing and revising templates. */
function baseVars(client: ClientDetail, lang: Lang, o: LandingOptions) {
  const pageType = PAGE_TYPES.find((p) => p.value === o.pageType)!
  return {
    client_name: client.name,
    client_name_ar: client.nameAr,
    emirate: client.emirate,
    tone: tone(client),
    client_brief: clientBrief(client),
    category_context: categoryContext(client),
    language_rule: LANGUAGE_RULE[lang],
    no_inventing: NO_INVENTING,
    page_type: pageType.label,
    page_type_guide: pageType.guide,
    service: o.service,
    area: o.area,
    target_emirate: o.emirate,
    primary_keyword: o.primaryKeyword,
    secondary_keywords: o.secondaryKeywords.join(", "),
    company_profile: client.companyProfile.trim() || NO_PROFILE,
    contact_details: `Phone ${formatPhone(client.phone)}, WhatsApp ${formatPhone(client.whatsapp)}`,
    // the length and the required sections come in the requirements, in the numbers for this page's language
    competitor_insights: o.serpBrief ? briefAsText(o.serpBrief, { withTargets: false }) : "",
  }
}

const PLAN_REQUEST = "Plan the landing page now and return the plan as JSON in the structure described."
const WRITE_REQUEST = "Write the body of the landing page now, following the plan and meeting every requirement. Return only the markdown."

/** The language instruction repeated in the request itself: with English keywords in the brief, the system prompt alone is not enough to get Arabic. */
function arabicNote(o: LandingOptions) {
  const secondary = o.secondaryKeywords.length ? `, secondary ${o.secondaryKeywords.map((k) => `"${k}"`).join(", ")}` : ""
  return `Translate the keywords into the natural Arabic search phrases people type, and use those Arabic phrases as the primary and secondary keywords throughout (all the keyword rules apply to the Arabic phrases). Spell every Arabic phrase the standard way people search for it (for example نقل الأثاث, شركة نقل أثاث) and check the spelling. Do not write the English keyword phrases anywhere in the page text. The English keywords below are only the brief: primary "${o.primaryKeyword}"${secondary}.`
}

function planRequest(lang: Lang, o: LandingOptions) {
  return lang === "en"
    ? PLAN_REQUEST
    : `${PLAN_REQUEST}\n\nThis page will be written in Arabic. ${arabicNote(o)} In keywords.primary and keywords.secondary give the Arabic phrases, and write every heading, the meta tags (except the slug) and the image alt texts in Arabic. Image file names and the slug stay in Latin letters.`
}

function writeRequest(lang: Lang, plan: Plan | null, o: LandingOptions) {
  if (lang === "en") return WRITE_REQUEST
  const phrases = plan?.keywords ?? { primary: o.primaryKeyword, secondary: o.secondaryKeywords }
  return `${WRITE_REQUEST}

Write this page in Arabic. Every heading and sentence must be in Arabic script. Keep only the brand name and phone numbers in Latin characters. Use exactly these Arabic keyword phrases, in this wording: primary "${phrases.primary}"${phrases.secondary.length ? `, secondary ${phrases.secondary.map((k) => `"${k}"`).join(", ")}` : ""}. Do not write the English keyword phrases anywhere.`
}

/* ------------------------------------------------------------------- steps */

const LONG = { timeoutMs: 240_000, retries: 1 }
/** a revision is not started after this long, so the whole request stays inside the route's time limit */
const REVISE_UNTIL_MS = 330_000
const MAX_REVISIONS = 3

/** Step one: decide the angle, the meta tags, the sections and their budgets, the keyword homes, the FAQ and the images. */
export async function planLandingPage(client: ClientDetail, lang: Lang, options: LandingOptions, req: Requirements = buildRequirements(options, lang)): Promise<Plan> {
  const system = (await loadTemplate("landing-page-brief")).render({ ...baseVars(client, lang, options), requirements: req.text }, lang)
  const raw = await generateJSON<unknown>(planRequest(lang, options), PLAN_SCHEMA, { systemInstruction: system, temperature: 0.4 })
  if (!isObject(raw) || !arr(raw.outline).length) throw new GeminiError("bad_response", "Gemini returned an incomplete plan. Try again.", 502)
  return normalizePlan(raw, req, options, lang)
}

/** One short call to rewrite a heading so that it carries the keyword. Null when the rewrite did not work. */
async function headingWithKeyword(heading: string, primary: string, lang: Lang) {
  try {
    const rewritten = (
      await generateText(
        `Rewrite this H2 heading of a landing page so that it contains the exact phrase "${primary}" (same spelling and word order), keeps the same meaning, reads naturally, is under 70 characters and makes no claim such as best, top, leading or number one. The heading is in ${lang === "ar" ? "Arabic" : "English"}. Return only the heading, with no quotes.\n\nHeading: ${heading}`,
        { temperature: 0.3 }
      )
    )
      .split("\n")[0]
      .replace(/^[#"'\s]+|["'\s]+$/g, "")
    return rewritten && norm(rewritten).includes(norm(primary)) ? rewritten : null
  } catch {
    return null
  }
}

/** The plan needs one heading with the exact keyword, because models keep missing that rule. */
async function planWithKeywordHeading(plan: Plan, lang: Lang): Promise<Plan> {
  const primary = plan.keywords.primary
  if (plan.outline.some((o) => norm(o.heading).includes(norm(primary)))) return plan
  const target = plan.outline.find((o) => o.kind === "section")
  if (!target) return plan
  const heading = await headingWithKeyword(target.heading, primary, lang)
  return heading ? { ...plan, outline: plan.outline.map((o) => (o === target ? { ...o, heading } : o)) } : plan
}

/** Write or revise the body, and refuse an answer that is not a page. */
async function body(system: string, request: string) {
  const md = cleanContent(await generateText(request, { systemInstruction: system, temperature: 0.6, ...LONG }))
  if (contentWords(md) < 150 || !/^##\s/m.test(md)) throw new GeminiError("bad_response", "Gemini returned an incomplete landing page. Try again.", 502)
  return md
}

/** The intro and the sections other than `skip`, each with its opening words, so an expansion can see what the rest of the page already says. */
function pageOutline(content: string, skip: string) {
  const { intro, sections } = parseContent(content)
  const gist = (text: string) => plainText(text).replace(/\s+/g, " ").slice(0, 200)
  return [`- Intro: ${gist(intro)}`, ...sections.filter((x) => norm(x.heading) !== norm(skip)).map((x) => `- ${x.heading}: ${gist(x.text)}`)].join("\n")
}

/**
 * Models fall short of a word count when asked to add words to a whole page, but write a single section to length reliably. So the
 * sections that came out well under their budget are expanded one by one, at the same time, each with new information and its own key points.
 * When every section meets its budget and the page is still short of its target, the largest sections and the FAQ share the shortfall.
 */
async function expandThinSections(page: LandingPage, plan: Plan, vars: Record<string, string | number>, lang: Lang, shortfall: number): Promise<LandingPage> {
  const sections = parseContent(page.content).sections
  const match = (o: OutlineItem, i: number) => sections.find((x) => norm(x.heading) === norm(o.heading)) ?? (sections.length === plan.outline.length ? sections[i] : undefined)
  const located = plan.outline.map((item, i) => ({ item, section: match(item, i) }))
  // the reviews section is never expanded: more words there would be invented praise
  let thin = located
    .filter((x) => x.section && x.item.kind === "section" && x.item.words >= 120 && x.section.words < x.item.words * 0.8)
    .sort((a, b) => b.item.words - b.section!.words - (a.item.words - a.section!.words))
    .slice(0, 5)
  if (!thin.length && shortfall > 0) {
    const growable = located.filter((x) => x.section && (x.item.kind === "section" || x.item.kind === "faq")).sort((a, b) => b.section!.words - a.section!.words).slice(0, 4)
    const each = Math.ceil(shortfall / Math.max(1, growable.length)) + 30
    thin = growable.map((x) => ({ item: { ...x.item, words: x.section!.words + each, keyPoints: x.item.kind === "faq" ? ["more questions visitors ask before booking, each with a direct answer of 40 to 60 words"] : x.item.keyPoints }, section: x.section }))
  }
  if (!thin.length) return page

  const template = await loadTemplate("landing-page-section")
  const results = await Promise.allSettled(
    thin.map(async ({ item, section }) => {
      const system = template.render(
        { ...vars, section_heading: section!.heading, section_text: section!.text, current_words: section!.words, target_words: item.words, key_points: item.keyPoints.join("; "), page_outline: pageOutline(page.content, section!.heading) },
        lang
      )
      const raw = await generateText("Expand the section now and return only its markdown body.", { systemInstruction: system, temperature: 0.6, ...LONG })
      // the model sometimes repeats the heading line, which the page already has
      const md = cleanContent(raw).replace(/^##\s+.*\n+/, "")
      return { heading: section!.heading, before: section!.words, md }
    })
  )
  let content = page.content
  for (const r of results) if (r.status === "fulfilled" && contentWords(r.value.md) > r.value.before - 3) content = replaceSectionBody(content, r.value.heading, r.value.md)
  return { ...page, content }
}

const SIMPLIFY_SCHEMA = object({ rewrites: list(text) })

/**
 * Reading ease comes down to sentence length, and a model handles it best when it only has to shorten sentences. So the long ones are
 * found in code, rewritten as short ones in one small call, and swapped into the page word for word. English only, up to twice.
 */
async function simplifyLongSentences(page: LandingPage, options: LandingOptions, lang: Lang): Promise<LandingPage> {
  if (lang !== "en") return page
  const target = readingTarget(options.serpBrief)
  const keep = [page.keywordUsed, ...page.secondaryUsed]
  let content = page.content
  for (let pass = 0; pass < 2; pass++) {
    const ease = fleschReadingEase(readableText(content))
    if (ease === null || ease >= target) break
    const sentences = longSentences(content)
    if (!sentences.length) break
    const prompt = `Rewrite each numbered sentence below as two or three short sentences of 8 to 14 words, using simpler words (one or two syllables where you can). Keep every fact, number and name. Keep these keyword phrases exactly as written wherever they appear: ${keep.map((k) => `"${k}"`).join(", ")}. Do not add information. Return JSON with "rewrites": exactly one string for each sentence, in the same order, holding the replacement text (plain text, no numbering).\n\n${sentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    let rewrites: string[]
    try {
      rewrites = strs((await generateJSON<{ rewrites?: unknown }>(prompt, SIMPLIFY_SCHEMA, { temperature: 0.3 })).rewrites)
    } catch (e) {
      if (e instanceof GeminiError) break
      throw e
    }
    let changed = false
    sentences.forEach((sentence, i) => {
      const next = rewrites[i]
      if (!next || next === sentence) return
      const was = sentence.split(/\s+/).length
      const now = next.split(/\s+/).length
      // only a faithful rewrite goes in: about the same amount of text, the keywords kept, no markdown
      const lostKeyword = keep.some((k) => norm(sentence).includes(norm(k)) && !norm(next).includes(norm(k)))
      if (now < was * 0.6 || now > was * 1.4 || lostKeyword || /[*#\[\]|]/.test(next)) return
      content = content.replace(sentence, next)
      changed = true
    })
    if (!changed) break
  }
  return content === page.content ? page : { ...page, content }
}

/** A changed page replaces the old one unless it breaks more of the hard checks. */
async function keepIfNotWorse(current: LandingPage, changed: LandingPage, rank: (page: LandingPage) => readonly [number, number]) {
  return changed !== current && rank(changed)[0] <= rank(current)[0] ? changed : current
}

/* ------------------------------------------------------------------ repair */

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** The longest start of `s` that fits `max` characters, cut at a word boundary. */
function cut(s: string, max: number) {
  if (s.length <= max) return s
  const head = s.slice(0, max)
  const at = head.lastIndexOf(" ")
  return (at > max * 0.5 ? head.slice(0, at) : head).replace(/[\s,;:|–—-]+$/, "")
}

/** Fit the title, description, slug and H1 to their rules. The model's wording is kept whenever it already fits. */
function repairMeta(meta: Meta, phrase: string, englishKeyword: string, brand: string): Meta {
  const has = (s: string) => norm(s).includes(norm(phrase))
  const h1 = meta.h1 || capital(phrase)

  let title = meta.title.trim()
  if (!title) title = `${capital(phrase)} | ${brand}`
  if (title.length > META_TITLE_MAX || !has(title)) {
    // drop the brand suffix first, then the tail, and never lose the keyword
    const withoutBrand = title.split(/\s[|–—-]\s/)[0]
    const candidates = [title, withoutBrand, `${capital(phrase)} | ${brand}`, capital(phrase)].filter((t) => t.length <= META_TITLE_MAX && has(t))
    title = candidates[0] ?? cut(capital(phrase), META_TITLE_MAX)
  }

  let description = meta.description.trim()
  if (!has(description)) description = `${capital(phrase)}. ${description}`.trim()
  if (description.length > META_DESCRIPTION_MAX) {
    // end on a full sentence when one fits
    const sentences = description.match(/[^.!?؟]+[.!?؟]/g) ?? []
    let fit = ""
    for (const s of sentences) {
      if ((fit + s).trim().length > META_DESCRIPTION_MAX) break
      fit += s
    }
    description = fit.trim() && has(fit) ? fit.trim() : cut(description, META_DESCRIPTION_MAX - 1).replace(/[.]*$/, "") + "."
  }

  const keywordSlug = slugify(englishKeyword)
  let slug = slugify(meta.slug)
  if (!slug || !slug.includes(keywordSlug)) slug = keywordSlug
  return { title, description, slug, h1 }
}

const strip = (alt: string, phrase: string) =>
  alt
    .replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim()

/** Clean file names that carry the keyword once or twice, alt texts under the limit with the keyword in one or two, sizes and loading. */
function repairImages(plan: Plan["images"], phrase: string, englishKeyword: string, count: number): ImagePlanItem[] {
  const tokens = slugify(englishKeyword).split("-").filter((t) => t && !FILLER.has(t))
  const used = new Set<string>()
  const images = plan.slice(0, Math.max(count, MIN_IMAGES)).map((img, i): ImagePlanItem => {
    let base = slugify(img.filename.replace(/\.[a-z0-9]+$/i, "")).slice(0, 58) || `${slugify(englishKeyword).slice(0, 40)}-photo-${i + 1}`
    while (used.has(base)) base = `${base.slice(0, 54)}-${i + 1}`
    used.add(base)
    const alt = img.alt.replace(/^(image|photo|picture) of\s+/i, "").trim()
    return { placement: img.placement, subject: img.subject, filename: `${base}.webp`, alt: cut(alt, MAX_ALT_LENGTH), size: i === 0 ? "1600x900" : "1200x800", loading: i === 0 ? "eager" : "lazy" }
  })
  if (!images.length) return images

  // one file name carries the keyword, so the photo is findable by what it shows
  if (isLatin(phrase) || tokens.length) {
    const named = (f: string) => tokens.length > 0 && tokens.every((t) => f.replace(/\.webp$/, "").split("-").includes(t))
    if (!images.some((i) => named(i.filename))) {
      const descriptor = slugify(images[0].subject.split(/\s+/).slice(0, 2).join(" ")) || "crew"
      const name = `${slugify(englishKeyword).slice(0, 40)}-${descriptor}`.replace(/-+$/, "").slice(0, 58)
      images[0] = { ...images[0], filename: `${name}.webp` }
    }
  }

  const has = (s: string) => norm(s).includes(norm(phrase))
  // the keyword is in at least one alt text, and in no more than a third of them
  if (!images.some((i) => has(i.alt))) images[0] = { ...images[0], alt: cut(`${capital(phrase)}: ${images[0].alt}`, MAX_ALT_LENGTH) }
  const limit = Math.max(2, Math.ceil(images.length / 3))
  let seen = 0
  return images.map((img) => {
    if (!has(img.alt)) return img
    seen++
    return seen > limit ? { ...img, alt: strip(img.alt, phrase) || img.alt } : img
  })
}

/** A LocalBusiness JSON-LD from the client's own details. Built here, not by the model, so it never states anything the client has not given. */
function buildSchema(client: ClientDetail, options: LandingOptions, page: LandingPage) {
  const service = options.service || `${client.name} services in ${options.area}`
  const business: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: client.name,
    ...(client.website ? { url: client.website } : {}),
    ...(client.phone ? { telephone: client.phone } : {}),
    description: page.meta.description,
    address: { "@type": "PostalAddress", addressRegion: options.emirate, addressCountry: "AE" },
    areaServed: [options.area, options.emirate].filter(Boolean),
    makesOffer: { "@type": "Offer", itemOffered: { "@type": "Service", name: service, areaServed: options.area || options.emirate } },
  }
  return JSON.stringify(business, null, 2)
}

/** The finished page from a body and the plan: every field outside the body is made here. */
function assemble(draft: string, plan: Plan | null, client: ClientDetail, options: LandingOptions, req: Requirements): LandingPage {
  // a customer quote the profile does not contain is made up, whatever the prompt said
  const content = stripInventedQuotes(draft, client.companyProfile)
  const phrases = plan?.keywords ?? { primary: options.primaryKeyword, secondary: options.secondaryKeywords }
  const meta = repairMeta(plan?.meta ?? { title: "", description: "", slug: "", h1: "" }, phrases.primary, options.primaryKeyword, client.name)
  // the headings really on the page, so a heading the writer reworded still counts for the sections it was planned to cover
  const h2 = parseContent(content).sections.map((x) => x.heading)
  const located = (o: OutlineItem, i: number) => h2.find((h) => norm(h) === norm(o.heading)) ?? (plan && h2.length === plan.outline.length ? h2[i] : undefined) ?? h2.find((h) => resembles(norm(h), norm(o.heading))) ?? o.heading
  const sectionCoverage = plan
    ? [
        ...plan.introCovers.map((section) => ({ section, location: "intro" })),
        ...plan.outline.flatMap((o, i) => o.covers.map((section) => ({ section, location: located(o, i) }))),
      ]
    : []
  const page: LandingPage = {
    keywordUsed: phrases.primary,
    secondaryUsed: phrases.secondary,
    meta,
    content,
    sectionCoverage,
    technicalSeo: { schema: "", internalLinks: plan?.internalLinks ?? [] },
    imagePlan: { rationale: plan?.imageReasoning ?? "", images: repairImages(plan?.images ?? [], phrases.primary, options.primaryKeyword, req.images) },
  }
  page.technicalSeo.schema = buildSchema(client, options, page)
  return page
}

/** If the body still has no H2 with the exact keyword, rename the heading of the section about the service itself. */
async function withKeywordHeading(page: LandingPage, plan: Plan | null, lang: Lang): Promise<LandingPage> {
  if (!checkLandingPage(page, { primaryKeyword: page.keywordUsed, secondaryKeywords: [] }, lang).some((c) => c.id === "h2" && c.ok === false)) return page
  const sections = parseContent(page.content).sections
  const planned = plan?.outline.find((o) => o.kind === "section")?.heading
  const target = sections.find((s) => planned && norm(s.heading) === norm(planned)) ?? sections.find((s) => !/faq|question|الأسئلة/i.test(s.heading)) ?? sections[0]
  if (!target) return page
  const heading = await headingWithKeyword(target.heading, page.keywordUsed, lang)
  if (!heading) return page
  const content = page.content.replace(new RegExp(`^##\\s+${target.heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"), `## ${heading}`)
  return { ...page, content, sectionCoverage: page.sectionCoverage.map((c) => (norm(c.location) === norm(target.heading) ? { ...c, location: heading } : c)) }
}

/* -------------------------------------------------------------- generator */

async function pageFor(client: ClientDetail, lang: Lang, options: LandingOptions): Promise<LandingPage> {
  const started = Date.now()

  // a plan that cannot be read should not cost the whole page: write without one
  let plan: Plan | null = null
  try {
    plan = await planLandingPage(client, lang, options)
  } catch (e) {
    if (!(e instanceof GeminiError) || e.code !== "bad_response") throw e
  }
  if (plan) plan = await planWithKeywordHeading(plan, lang)

  // the requirements again, now in the keyword phrases the page will really use
  const req = buildRequirements(options, lang, plan?.keywords)
  const vars = {
    ...baseVars(client, lang, options),
    requirements: req.text,
    content_plan: plan ? JSON.stringify(plan.forWriter, null, 1) : NO_PLAN,
    h1: plan?.meta.h1 || options.primaryKeyword,
    title_max: META_TITLE_MAX,
    description_max: META_DESCRIPTION_MAX,
    writing_rules: AI_WRITING_PATTERNS,
  }
  const writer = (await loadTemplate("landing-page")).render(vars, lang)
  const reviser = await loadTemplate("landing-page-revise")

  const rank = (page: LandingPage) => pageRank(page, options, lang, req)
  let best = assemble(await body(writer, writeRequest(lang, plan, options)), plan, client, options, req)

  // the checks are code, so what the draft missed can be named exactly: fix it, and keep the best draft
  for (let round = 0; round < MAX_REVISIONS && Date.now() - started < REVISE_UNTIL_MS; round++) {
    try {
      // length first, section by section; a page that grew without breaking more rules is kept
      if (plan && landingWordCount(best) < req.words.aim) {
        const expanded = await expandThinSections(best, plan, vars, lang, req.words.aim - landingWordCount(best))
        if (landingWordCount(expanded) > landingWordCount(best) && rank(expanded)[0] <= rank(best)[0]) best = expanded
      }
    } catch (e) {
      if (!(e instanceof GeminiError)) throw e
    }
    best = await keepIfNotWorse(best, await simplifyLongSentences(best, options, lang), rank)
    const report = gapReport(best, options, lang, req, plan?.outline)
    if (!report.lines.length) break
    try {
      const system = reviser.render({ ...vars, current_content: best.content, gap_report: report.lines.map((l) => `- ${l}`).join("\n") }, lang)
      const revised = assemble(await body(system, "Revise the landing page now. Fix every item of the audit and return the complete corrected markdown."), plan, client, options, req)
      if (betterThan(rank(revised), rank(best))) best = revised
    } catch (e) {
      // a revision that fails is not worth losing a good draft for
      if (!(e instanceof GeminiError)) throw e
      break
    }
  }
  // the revisions can bring long sentences back, so the last word on reading ease is a final pass
  best = await keepIfNotWorse(best, await simplifyLongSentences(best, options, lang), rank)
  // a button after every paragraph that the revisions did not remove: keep one in the intro and the last one in each section
  if (ctaLines(best.content) > MAX_CTAS - 2) best = { ...best, content: limitCtas(best.content) }
  return withKeywordHeading(best, plan, lang)
}

export async function generateLandingPage(client: ClientDetail, { language, ...options }: LandingRequest): Promise<LandingResult> {
  const langs = languagesOf(language)
  const pages = await Promise.all(langs.map((lang) => pageFor(client, lang, options)))
  return Object.fromEntries(langs.map((lang, i) => [lang, pages[i]])) as LandingResult
}

/** For "Test with sample client": expand one short section, so the section prompt can be tried on its own. */
export async function expandSampleSection(client: ClientDetail, options: LandingOptions): Promise<string> {
  const lang: Lang = "en"
  const system = (await loadTemplate("landing-page-section")).render(
    {
      ...baseVars(client, lang, options),
      section_heading: "How a villa move is planned",
      section_text: "A surveyor visits first. Then we agree a plan and a date.",
      current_words: 12,
      target_words: 200,
      key_points: "the survey; the packing plan; access, parking and building rules",
      page_outline: "- Intro: Villa movers made simple.\n- Why choose us: A careful crew and a clear quote.\n- Frequently Asked Questions: Costs, permits and timing.",
      writing_rules: AI_WRITING_PATTERNS,
    },
    lang
  )
  return cleanContent(await generateText("Expand the section now and return only its markdown body.", { systemInstruction: system, temperature: 0.6, ...LONG }))
}

/** For "Test with sample client": revise a deliberately thin draft once, so the revision prompt can be tried on its own. */
export async function reviseSampleDraft(client: ClientDetail, options: LandingOptions): Promise<string> {
  const lang: Lang = "en"
  const req = buildRequirements(options, lang)
  const draft = `${options.primaryKeyword} made simple. Our crew handles your move from start to finish. [Call Now](#call)\n\n## Why customers pick us\n\nA careful crew and a clear plan.\n\n## How it works\n\n1. **Survey.** We visit and quote.\n2. **Pack and move.** We pack, load and drive.`
  const page = assemble(draft, null, client, options, req)
  const report = gapReport(page, options, lang, req)
  const vars = {
    ...baseVars(client, lang, options),
    requirements: req.text,
    content_plan: NO_PLAN,
    writing_rules: AI_WRITING_PATTERNS,
    current_content: draft,
    gap_report: report.lines.map((l) => `- ${l}`).join("\n") || "- (nothing found)",
  }
  const system = (await loadTemplate("landing-page-revise")).render(vars, lang)
  return body(system, "Revise the landing page now. Fix every item of the audit and return the complete corrected markdown.")
}
