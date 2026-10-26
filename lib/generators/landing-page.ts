import { SchemaType, type ResponseSchema } from "@google/generative-ai"

import { formatPhone } from "@/lib/client-schema"
import type { ClientDetail } from "@/lib/clients"
import { briefAsText, readingTarget } from "@/lib/competitor-types"
import { META_DESCRIPTION_MAX, META_TITLE_MAX, type Language } from "@/lib/content-types"
import { GeminiError, generateJSON, generateText } from "@/lib/gemini"
import {
  PAGE_TYPES,
  checkLandingPage,
  failedHardChecks,
  landingWordCount,
  languagesOf,
  normalizeLandingPage,
  readabilityHints,
  scaledWordTarget,
  type LandingOptions,
  type LandingPage,
  type LandingResult,
  type SeoCheck,
} from "@/lib/landing-page-types"
import { AI_WRITING_PATTERNS } from "@/lib/prompts/humanizer"
import { LANGUAGE_RULE, NO_INVENTING, categoryContext, clientBrief, tone, type Lang } from "@/lib/prompts/shared"
import { loadTemplate } from "@/lib/prompts/store"

export type LandingRequest = LandingOptions & { language: Language }

/* ----------------------------------------------------------------- schema */

const text: ResponseSchema = { type: SchemaType.STRING }
const int: ResponseSchema = { type: SchemaType.INTEGER }
const bool: ResponseSchema = { type: SchemaType.BOOLEAN }
const list = (items: ResponseSchema): ResponseSchema => ({ type: SchemaType.ARRAY, items })
const object = (properties: Record<string, ResponseSchema>): ResponseSchema => ({ type: SchemaType.OBJECT, properties, required: Object.keys(properties) })

const LANDING_SCHEMA = object({
  keywordUsed: text,
  secondaryUsed: list(text),
  meta: object({ title: text, description: text, slug: text, h1: text }),
  hero: object({ headline: text, subheadline: text, cta: text, trustBadges: list(text) }),
  headings: object({ benefits: text, service: text, process: text, socialProof: text, faq: text }),
  benefits: list(object({ icon: text, heading: text, description: text })),
  serviceDetails: list(text),
  process: list(object({ title: text, description: text, confirm: bool })),
  additionalSections: list(object({ heading: text, placement: text, paragraphs: list(text) })),
  sectionCoverage: list(object({ section: text, location: text })),
  socialProof: object({
    testimonials: list(object({ quote: text, name: text, detail: text })),
    stats: list(object({ value: text, label: text })),
  }),
  faq: list(object({ question: text, answer: text })),
  cta: object({ headline: text, description: text, phoneButton: text, whatsappButton: text }),
  technicalSeo: object({ schema: text, internalLinks: list(object({ anchor: text, page: text })) }),
  imagePlan: object({
    rationale: text,
    images: list(object({ placement: text, subject: text, filename: text, alt: text, size: text, loading: text })),
  }),
})

const PLAN_SCHEMA = object({
  intent: text,
  messageMatch: text,
  angle: text,
  proofPoints: list(text),
  missingFacts: list(text),
  keywords: object({ primary: text, secondary: list(text), placement: list(text) }),
  sections: list(object({ section: text, purpose: text, keyPoint: text, microCta: text, words: int })),
  sectionCoverage: list(object({ section: text, location: text, reason: text })),
  additionalSections: list(object({ heading: text, placement: text, purpose: text, words: int })),
  processSteps: list(object({ title: text, detail: text, needsConfirmation: bool })),
  faqPlan: list(object({ question: text, keywordVariant: text })),
  imageCount: int,
  imageReasoning: text,
  wordCountTarget: object({ min: int, max: int }),
})

/** The step-one plan. Only a few fields are read in code; the rest is passed to the writer as it is. */
type Plan = {
  keywords?: { primary?: string; secondary?: string[] }
  imageCount?: number
} & Record<string, unknown>

/* ----------------------------------------------------------------- prompts */

const NO_PROFILE = "(No company profile has been added for this client. Treat every company-specific fact as missing and use [PLACEHOLDER: add your X] markers.)"
const NO_PLAN = "(No plan is available. Decide the intent, angle, keyword placement, process steps, FAQ topics and image count yourself, following the rules below.)"

/** Variables shared by the planning and the writing template. */
function baseVars(client: ClientDetail, lang: Lang, o: LandingOptions) {
  const pageType = PAGE_TYPES.find((p) => p.value === o.pageType)!
  const target = scaledWordTarget(o.serpBrief, lang)
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
    target_emirate: o.emirate,
    primary_keyword: o.primaryKeyword,
    secondary_keywords: o.secondaryKeywords.join(", "),
    company_profile: client.companyProfile.trim() || NO_PROFILE,
    contact_details: `Phone ${formatPhone(client.phone)}, WhatsApp ${formatPhone(client.whatsapp)}`,
    competitor_insights: o.serpBrief ? briefAsText(o.serpBrief) : "",
    word_target: target.max > 0 ? `between ${target.min} and ${target.max} words` : "",
    reading_target: readingTarget(o.serpBrief),
    required_sections: o.serpBrief?.commonSections.join("; ") ?? "",
  }
}

const PLAN_REQUEST = "Plan the landing page now and return the plan as JSON in the structure described."
const REQUEST = "Write the landing page content now and return it as JSON in the structure described."

/** The language instruction repeated in the request itself: with English keywords in the brief, the system prompt alone is not enough to get Arabic. */
function arabicNote(o: LandingOptions) {
  const secondary = o.secondaryKeywords.length ? `, secondary ${o.secondaryKeywords.map((k) => `"${k}"`).join(", ")}` : ""
  return `Translate the keywords into the natural Arabic search phrases people type, and use those Arabic phrases as the primary and secondary keywords throughout (all the keyword rules apply to the Arabic phrases). Do not write the English keyword phrases anywhere in the page text. keywordUsed and secondaryUsed must be the Arabic phrases. The English keywords below are only the brief: primary "${o.primaryKeyword}"${secondary}.`
}

function planRequest(lang: Lang, o: LandingOptions) {
  return lang === "en" ? PLAN_REQUEST : `${PLAN_REQUEST}\n\nThis page will be written in Arabic. ${arabicNote(o)} In keywords.primary and keywords.secondary give the Arabic phrases.`
}

function pageRequest(lang: Lang, o: LandingOptions, plan: Plan | null) {
  const count = typeof plan?.imageCount === "number" && plan.imageCount > 0 ? Math.min(12, Math.round(plan.imageCount)) : null
  const images = count ? `\n\nThe image plan must contain exactly ${count} images.` : ""
  if (lang === "en") return `${REQUEST}${images}`
  return `${REQUEST}${images}

Write this page in Arabic. Every field except the URL slug, the image file names and the image sizes must be in Arabic script: title tag, meta description, H1, headline, headings, benefits, service details, process, FAQ, buttons, image alt texts and internal link anchors. Keep only the brand name, phone numbers and the JSON-LD property names in Latin characters.
${arabicNote(o)}`
}

/* -------------------------------------------------------------- generator */

/** Step one: decide the angle, the keyword placement, the process steps, the FAQ topics and the image count. */
export async function planLandingPage(client: ClientDetail, lang: Lang, options: LandingOptions): Promise<Plan> {
  const system = (await loadTemplate("landing-page-brief")).render(baseVars(client, lang, options), lang)
  const plan = await generateJSON<Plan>(planRequest(lang, options), PLAN_SCHEMA, { systemInstruction: system, temperature: 0.4 })
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) throw new GeminiError("bad_response", "Gemini returned an incomplete plan. Try again.", 502)
  return plan
}

/** What the model is told when a draft broke rules: the rules, and for length, readability and sections the specifics to fix. */
function feedbackFor(page: LandingPage, failed: SeoCheck[], options: LandingOptions, lang: Lang) {
  const lines = failed.map((c) => `- ${c.label} (${c.detail})`)
  const ids = new Set(failed.map((c) => c.id))
  const notes: string[] = []

  if (ids.has("length")) {
    const target = scaledWordTarget(options.serpBrief, lang)
    const total = landingWordCount(page)
    notes.push(
      total < target.min
        ? `LENGTH: the page has ${total} words of visible copy and needs at least ${target.min}. Add about ${target.min - total} words of useful, specific detail from the profile and the plan: fuller additional sections, service paragraphs, process steps and FAQ answers, written as short sentences. No padding.`
        : `LENGTH: the page has ${total} words and the most it should have is ${target.max}. Cut about ${total - target.max} words from the weakest sections.`
    )
  }
  if (ids.has("readability")) {
    const hints = readabilityHints(page)
    notes.push(
      `READABILITY: the copy must reach reading ease ${readingTarget(options.serpBrief)}. Your sentences average ${hints.averageSentence} words; aim for 8 to 14 and never more than 20.${hints.long.length ? ` Rewrite these as two or three short sentences each: ${hints.long.map((t) => `"${t}"`).join(" ")}` : ""}${hints.hard.length ? ` Replace these long words with simpler ones where you can: ${hints.hard.join(", ")}.` : ""} Keep the same facts and keep the length.`
    )
  }
  if (ids.has("sections")) notes.push("SECTIONS: every section the ranking pages share must be listed in sectionCoverage and covered by a fixed section or by one of your additionalSections. Add the missing ones.")

  return [`Your previous draft broke these rules:`, ...lines, ...notes].join("\n")
}

async function pageFor(client: ClientDetail, lang: Lang, options: LandingOptions): Promise<LandingPage> {
  // a plan that cannot be read should not cost the whole page: write without one
  let plan: Plan | null = null
  try {
    plan = await planLandingPage(client, lang, options)
  } catch (e) {
    if (!(e instanceof GeminiError) || e.code !== "bad_response") throw e
  }

  const system = (await loadTemplate("landing-page")).render(
    {
      ...baseVars(client, lang, options),
      content_plan: plan ? JSON.stringify(plan, null, 1) : NO_PLAN,
      title_max: META_TITLE_MAX,
      description_max: META_DESCRIPTION_MAX,
      writing_rules: AI_WRITING_PATTERNS,
    },
    lang
  )

  const attempt = async (prompt: string) => {
    const page = normalizeLandingPage(await generateJSON<unknown>(prompt, LANDING_SCHEMA, { systemInstruction: system, temperature: 0.6 }))
    if (!page) throw new GeminiError("bad_response", "Gemini returned an incomplete landing page. Try again.", 502)
    return { page, failed: failedHardChecks(checkLandingPage(page, options, lang)) }
  }

  const request = pageRequest(lang, options, plan)
  let best = await attempt(request)
  // the keyword rules are checkable, so give the model up to two chances to fix what it missed and keep the best draft
  for (let round = 0; round < 2 && best.failed.length; round++) {
    const retry = await attempt(
      `${request}\n\n${feedbackFor(best.page, best.failed, options, lang)}\n\nPrevious draft:\n${JSON.stringify(best.page)}\n\nReturn the complete corrected page. Fix those rules, rewriting or adding copy where the feedback says so, and keep every rule that already passes.`
    )
    if (retry.failed.length < best.failed.length) best = retry
  }
  return withKeywordHeading(best.page, options, lang)
}

/**
 * The one hard rule models keep missing is the exact keyword in an H2. When a finished page still lacks it, a short
 * call rewrites the service heading to carry it; if that does not work the heading stays as written.
 */
async function withKeywordHeading(page: LandingPage, options: LandingOptions, lang: Lang): Promise<LandingPage> {
  if (!checkLandingPage(page, options, lang).some((c) => c.id === "h2" && c.ok === false)) return page
  const primary = page.keywordUsed || options.primaryKeyword
  try {
    const rewritten = (
      await generateText(
        `Rewrite this H2 heading of a landing page so that it contains the exact phrase "${primary}" (same spelling and word order), keeps the same meaning, reads naturally and is under 70 characters. The heading is in ${lang === "ar" ? "Arabic" : "English"}. Return only the heading, with no quotes.\n\nHeading: ${page.headings.service}`,
        { temperature: 0.3 }
      )
    )
      .split("\n")[0]
      .replace(/^[#"'\s]+|["'\s]+$/g, "")
    if (rewritten && rewritten.toLowerCase().includes(primary.toLowerCase())) return { ...page, headings: { ...page.headings, service: rewritten } }
  } catch {
    // best effort: the checklist still tells the user, and Edit mode can fix it
  }
  return page
}

export async function generateLandingPage(client: ClientDetail, { language, ...options }: LandingRequest): Promise<LandingResult> {
  const langs = languagesOf(language)
  const pages = await Promise.all(langs.map((lang) => pageFor(client, lang, options)))
  return Object.fromEntries(langs.map((lang, i) => [lang, pages[i]])) as LandingResult
}
