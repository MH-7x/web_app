/**
 * What a finished landing page must satisfy, as numbers worked out from the keywords and the competitor analysis (the requirements
 * sheet the prompts carry), how the page compares with the ranking pages, and the gap report that tells the reviser exactly what to fix.
 * Pure code, no model: safe to import from client components.
 */

import { fleschReadingEase } from "@/lib/audit/text"
import { readingTarget } from "@/lib/competitor-types"
import { META_DESCRIPTION_MAX, META_TITLE_MAX } from "@/lib/content-types"
import { ctaCounts, ctaLines, faqItems, hasProcessSection, parseContent, plainText, processSteps, readableText, repeatedSentences } from "@/lib/landing-content"
import {
  MAX_ALT_LENGTH,
  MAX_CTAS,
  MAX_DENSITY_PERCENT,
  MAX_WORDS_BEFORE_CTA,
  MIN_CTAS,
  MIN_PROCESS_STEPS,
  checkLandingPage,
  countOf,
  coverageProblems,
  failedHardChecks,
  faqTarget,
  landingWordCount,
  readabilityHints,
  scaledWordTarget,
  unprovenClaims,
  type LandingOptions,
  type LandingPage,
  type SeoCheck,
} from "@/lib/landing-page-types"

/** With no competitor analysis there is no measured target, so the writer aims for a page that is full enough to compete. */
const DEFAULT_WORDS = { min: 1000, max: 1500 }

/** One H2 section of the planned page. */
export type OutlineItem = {
  heading: string
  /** intro, section, process, proof, faq or cta */
  kind: string
  purpose: string
  keyPoints: string[]
  /** the word budget for the section */
  words: number
  /** the shared competitor sections this section covers */
  covers: string[]
  /** the secondary keywords that belong in this section */
  secondary: string[]
}

export type Requirements = {
  lang: "en" | "ar"
  words: { min: number; max: number; aim: number; fromCompetitors: boolean }
  primaryUses: { min: number; max: number }
  faq: { min: number; max: number }
  images: number
  /** lines of the copy with a call or WhatsApp button */
  ctas: number
  readingEase: number
  requiredSections: string[]
  /** the sheet as text for a prompt */
  text: string
}

/** The keyword phrases as the page uses them: a page in Arabic uses translations, which the plan supplies. */
export type Phrases = { primary: string; secondary: string[] }

export function buildRequirements(options: Pick<LandingOptions, "primaryKeyword" | "secondaryKeywords" | "serpBrief">, lang: "en" | "ar", phrases?: Phrases): Requirements {
  const brief = options.serpBrief
  const primary = phrases?.primary || options.primaryKeyword
  const secondary = phrases?.secondary ?? options.secondaryKeywords
  const measured = scaledWordTarget(brief, lang)
  const fromCompetitors = measured.max > 0
  const k = lang === "ar" ? 0.85 : 1
  const range = fromCompetitors ? measured : { min: Math.round(DEFAULT_WORDS.min * k), max: Math.round(DEFAULT_WORDS.max * k) }
  // models stop a little short of the number they are given, so aim above the minimum
  const aim = Math.min(Math.round((range.min + range.max) / 2), Math.round(range.min * 1.1))
  const typical = Math.round((aim + range.max) / 2)
  const usesMin = Math.max(5, Math.round(typical / 280))
  const uses = { min: usesMin, max: Math.max(usesMin + 3, Math.floor(typical * 0.012)) }
  const faqMin = faqTarget(brief)
  const faq = { min: faqMin, max: Math.min(9, faqMin + 2) }
  const images = brief?.recommendedImageCount && brief.recommendedImageCount > 0 ? brief.recommendedImageCount : 6
  const cta = Math.min(8, Math.max(MIN_CTAS, Math.round(typical / 450)))
  const ease = readingTarget(brief)
  const required = brief?.commonSections ?? []
  const sectionsMin = Math.min(12, Math.max(7, brief?.benchmark.h2Median ?? 0))

  const lines = [
    "LENGTH",
    `- The visible copy (the H1, the headings and the body; not the meta tags, schema or image plan) is between ${aim} and ${range.max} words. Below ${range.min} words fails the check, so do not stop early.${fromCompetitors ? ` The pages that rank have a median of ${brief!.benchmark.wordCountMedian} words, and this page must match or beat them.` : " There is no competitor data, so this is the length a service page needs to be competitive."}`,
    "",
    "KEYWORDS",
    `- Primary keyword "${primary}": always in this exact wording. Use it ${uses.min} to ${uses.max} times across the whole page (headings count), never in two sentences in a row. It must appear in: the title tag, the meta description, the H1, the first 100 words of the page, at least one H2, the URL slug, one or two image alt texts and one or two image file names. Keep the density under ${MAX_DENSITY_PERCENT}%. Use natural variations (the service on its own, the place on its own, "our team", "the crew") for the rest.`,
    secondary.length
      ? `- Secondary keywords: ${secondary.map((s) => `"${s}"`).join(", ")}. Each one appears in its exact wording at least twice in the body, and at least once in an H2 or H3 where it reads naturally. Spread them across different sections.`
      : "- There are no secondary keywords. Work in related terms (areas, building types, permits, equipment) from the company profile.",
    "",
    "STRUCTURE",
    required.length
      ? `- The ranking pages share these sections, and this page contains every one, each as an H2 section with at least 50 words: ${required.map((s) => `"${s}"`).join("; ")}. The introduction before the first H2 covers an introduction or overview.`
      : "- Use an H2 section for each part of the page: benefits, the service in detail, the process, reviews, the FAQ and a closing call to action.",
    `- At least ${sectionsMin} H2 sections in total${brief?.benchmark.h2Median ? ` (the ranking pages have a median of ${brief.benchmark.h2Median})` : ""}, so the page covers its topic in as much depth as they do.`,
    `- The process is an ordered list of ${MIN_PROCESS_STEPS} to 6 steps under its own H2, each item starting with the step title in bold.`,
    `- The FAQ is an H2 with ${faq.min} to ${faq.max} questions, each question an H3 followed by a 40 to 60 word answer that opens with the direct answer.`,
    `- Calls to action are markdown links to #call and #whatsapp, for example [Call Now](#call) and [WhatsApp Us](#whatsapp). Put the first one within the first ${MAX_WORDS_BEFORE_CTA} words and end each H2 section with one line holding the buttons (one line per section, never one after every paragraph): ${cta} to ${MAX_CTAS - 2} such lines in total.`,
    "- Say everything once. No sentence, fact or claim appears in two places on the page. A second mention gets a different angle or is left out. The FAQ answers add detail the body does not already give, and the process section is the list of steps, not a retelling of them.",
    "- No claim the company cannot prove: not best, top, leading, number one, cheapest or guaranteed, and nothing about what customers say or think unless the company profile quotes them.",
    "- Fill the length with new, useful information for the visitor (practical advice about the service, answers to the questions the ranking pages leave open), never with repetition.",
    "",
    "READABILITY",
    lang === "en"
      ? `- Flesch reading ease of ${ease} or higher: sentences of 8 to 14 words (never more than 20), words of one or two syllables where possible, one idea per sentence, active voice.`
      : "- Short, plain sentences. One idea per sentence.",
    "",
    "IMAGES AND META",
    `- ${images} images, each a real photo of the client's own crew, trucks or work. File names are lowercase Latin words joined by hyphens ending in .webp, and one or two of them contain the primary keyword. Alt texts describe what is visible in under ${MAX_ALT_LENGTH} characters, and the keyword is in one or two of them, not all.`,
    `- Title tag at most ${META_TITLE_MAX} characters; meta description at most ${META_DESCRIPTION_MAX} characters, with a call to action; URL slug in lowercase Latin letters and hyphens containing the keyword.`,
  ]

  return { lang, words: { min: range.min, max: range.max, aim, fromCompetitors }, primaryUses: uses, faq, images, ctas: cta, readingEase: ease, requiredSections: required, text: lines.join("\n") }
}

/* -------------------------------------------------------- comparison */

export type ComparisonRow = { label: string; ours: string; theirs: string; status: "ok" | "short" | "info" }

/** The page set against the figures measured on the ranking pages. Null when no competitors were analyzed. */
export function compareWithCompetitors(page: LandingPage, options: Pick<LandingOptions, "primaryKeyword" | "serpBrief">, lang: "en" | "ar"): ComparisonRow[] | null {
  const brief = options.serpBrief
  if (!brief || !brief.benchmark.pages) return null
  const b = brief.benchmark
  const words = landingWordCount(page)
  const target = scaledWordTarget(brief, lang)
  const sections = parseContent(page.content).sections
  const faq = faqItems(page.content).length
  const ctas = ctaLines(page.content)
  const ease = lang === "en" ? fleschReadingEase(readableText(page.content)) : null
  const primary = page.keywordUsed || options.primaryKeyword
  const required = brief.commonSections
  const uncovered = required.length ? coverageProblems(page, required).length : 0
  const have = (yes: boolean) => (yes ? "yes" : "no")

  return [
    { label: "Words", ours: `${words}`, theirs: `median ${b.wordCountMedian}, target ${target.min}-${target.max}`, status: words >= target.min ? "ok" : "short" },
    { label: "H2 sections", ours: `${sections.length}`, theirs: `median ${b.h2Median}`, status: sections.length >= b.h2Median ? "ok" : "short" },
    { label: "FAQ questions", ours: `${faq}`, theirs: `median ${b.faqMedian}; ${b.faqPercent}% have an FAQ`, status: faq >= b.faqMedian ? "ok" : "short" },
    { label: "Images planned", ours: `${page.imagePlan.images.length}`, theirs: `median ${b.imageMedian}; recommended ${brief.recommendedImageCount}`, status: page.imagePlan.images.length >= Math.min(brief.recommendedImageCount, b.imageMedian || brief.recommendedImageCount) ? "ok" : "short" },
    ...(b.readingEaseMedian !== null && lang === "en" ? [{ label: "Reading ease", ours: ease === null ? "-" : `${ease}`, theirs: `median ${b.readingEaseMedian}`, status: ease !== null && ease >= b.readingEaseMedian ? ("ok" as const) : ("short" as const) }] : []),
    { label: "Shared sections covered", ours: `${required.length - uncovered} of ${required.length}`, theirs: "all of them", status: uncovered === 0 ? "ok" : "short" },
    { label: "Process section", ours: have(hasProcessSection(page.content)), theirs: `${b.processPercent}% have one`, status: hasProcessSection(page.content) || b.processPercent < 50 ? "ok" : "short" },
    { label: "Lines with call or WhatsApp buttons", ours: `${ctas}`, theirs: `${b.telPercent}% call, ${b.whatsappPercent}% WhatsApp`, status: ctas >= MIN_CTAS ? "ok" : "short" },
    { label: "Keyword in title and H1", ours: have(countOf(page.meta.title, primary) > 0 && countOf(page.meta.h1, primary) > 0), theirs: `${b.keywordInTitlePercent}% title, ${b.keywordInH1Percent}% H1`, status: countOf(page.meta.title, primary) > 0 && countOf(page.meta.h1, primary) > 0 ? "ok" : "short" },
    ...(brief.contentGaps.length ? [{ label: "Gaps the ranking pages leave", ours: "covered in the copy", theirs: `${brief.contentGaps.length} found`, status: "info" as const }] : []),
  ]
}

/* --------------------------------------------------------- gap report */

/** Failed checks the body can fix. The title, slug, alt texts and file names are repaired in code, not by rewriting the body. */
const BODY_CHECKS = new Set<SeoCheck["id"]>(["language", "first100", "h2", "secondary", "density", "process", "faq", "cta", "repetition", "claims", "readability", "length", "sections"])

export type GapReport = { failed: SeoCheck[]; lines: string[] }

/**
 * Everything wrong with the body, each with what to do about it: the checks that failed, sections that are missing or thinner than
 * planned, secondary keywords with the section they belong in. An empty `lines` means there is nothing to revise.
 */
export function gapReport(page: LandingPage, options: Pick<LandingOptions, "primaryKeyword" | "secondaryKeywords" | "serpBrief">, lang: "en" | "ar", req: Requirements, outline: OutlineItem[] = []): GapReport {
  const all = checkLandingPage(page, options, lang)
  const failed = failedHardChecks(all).filter((c) => BODY_CHECKS.has(c.id))
  const ids = new Set(failed.map((c) => c.id))
  const primary = page.keywordUsed || options.primaryKeyword
  const lines: string[] = []
  const total = landingWordCount(page)

  if (ids.has("length")) {
    lines.push(
      total < req.words.min || total < req.words.aim * 0.95
        ? `LENGTH: the page has ${total} words and must have between ${req.words.aim} and ${req.words.max}. Add about ${Math.max(40, req.words.aim - total)} words of NEW information, never a sentence or fact that is already on the page. Good additions: practical advice for the customer from general knowledge of the service (what to prepare, how building permits, lift and loading-bay bookings usually work, what affects the price, how long it takes, how fragile and heavy items are handled; stated as advice, never as facts about this company), and the key points of the thinnest sections (listed below).`
        : `LENGTH: the page has ${total} words and the most it should have is ${req.words.max}. Cut about ${total - req.words.max} words from the weakest sections.`
    )
  }
  const sections = parseContent(page.content).sections
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
  for (const item of outline) {
    const found = sections.find((s) => key(s.heading) === key(item.heading))
    if (!found) lines.push(`MISSING SECTION: add the H2 "${item.heading}" (about ${item.words} words, ${item.purpose}). Key points: ${item.keyPoints.join("; ")}.`)
    else if (item.words >= 120 && found.words < item.words * 0.65) lines.push(`THIN SECTION: "${item.heading}" has ${found.words} words and the plan gives it ${item.words}. Add about ${item.words - found.words} words covering: ${item.keyPoints.join("; ") || item.purpose}.`)
  }
  if (ids.has("sections")) {
    const required = options.serpBrief?.commonSections ?? []
    for (const problem of coverageProblems(page, required)) lines.push(`SECTION: ${problem}. Add or expand an H2 section for it.`)
  }
  if (ids.has("secondary")) {
    const missing = (page.secondaryUsed.length ? page.secondaryUsed : options.secondaryKeywords).filter((k) => countOf(plainText(page.content), k) === 0)
    for (const k of missing) {
      const where = outline.find((o) => o.secondary.some((s) => key(s) === key(k)))
      lines.push(`SECONDARY KEYWORD: "${k}" is not in the body. Use it, in exactly this wording, at least twice${where ? `, starting in the section "${where.heading}"` : ""}, once in an H2 or H3 if it reads naturally.`)
    }
  }
  if (ids.has("density")) {
    const uses = countOf(`${page.meta.h1}\n${plainText(page.content)}`, primary)
    lines.push(
      uses === 0
        ? `PRIMARY KEYWORD: "${primary}" never appears. Use it ${req.primaryUses.min} to ${req.primaryUses.max} times.`
        : `KEYWORD DENSITY: "${primary}" appears ${uses} times in ${total} words, over the ${MAX_DENSITY_PERCENT}% limit. Replace some uses with "the service", "our crew", the place name alone, or a pronoun, until it appears at most ${req.primaryUses.max} times.`
    )
  }
  if (ids.has("first100")) lines.push(`FIRST 100 WORDS: the exact phrase "${primary}" must be in the first two sentences of the intro.`)
  if (ids.has("h2")) lines.push(`H2: rename one section heading (the one about the service itself) so it contains "${primary}" exactly, keeping it under 70 characters.`)
  if (ids.has("process")) lines.push(`PROCESS: write an H2 section with an ordered list of ${MIN_PROCESS_STEPS} to 6 steps, each item starting with the step title in bold. It has ${processSteps(page.content).length} now.`)
  if (ids.has("faq")) lines.push(`FAQ: the FAQ section has ${faqItems(page.content).length} questions and needs ${req.faq.min} to ${req.faq.max}. Add questions as H3 headings, each with a 40 to 60 word answer.`)
  if (ids.has("cta")) {
    const n = ctaLines(page.content)
    lines.push(
      n > MAX_CTAS
        ? `CALLS TO ACTION: the page has ${n} lines with call or WhatsApp buttons and may have at most ${MAX_CTAS - 2}. Keep one such line in the intro and one at the end of each section, and remove the rest. Too many now: ${ctaCounts(page.content).filter((c) => c.count > 1).map((c) => `${c.heading} (${c.count})`).join(", ")}.`
        : `CALLS TO ACTION: the page needs ${req.ctas} to ${MAX_CTAS - 2} lines with links like [Call Now](#call) or [WhatsApp Us](#whatsapp), the first within the first ${MAX_WORDS_BEFORE_CTA} words, and one near the end. It has ${n}.`
    )
  }
  if (ids.has("repetition")) {
    const repeated = repeatedSentences(page.content)
    lines.push(`REPEATED TEXT: these sentences appear more than once on the page: ${repeated.slice(0, 6).map((s) => `"${s.length > 140 ? s.slice(0, 140) + "…" : s}"`).join(" ")}. Keep each fact in the one place it belongs, and delete or rewrite the other copies with something new. Do not move a repeated sentence to another section.`)
  }
  if (ids.has("claims")) {
    const secondary = page.secondaryUsed.length ? page.secondaryUsed : options.secondaryKeywords
    lines.push(`CLAIMS: remove or rewrite these, which the company cannot prove: ${unprovenClaims(page, [primary, ...secondary]).slice(0, 6).map((s) => `"${s}"`).join(" ")}. Say what the company does instead of ranking it, and never say what customers say, think or feel unless the profile quotes them.`)
  }
  if (ids.has("language")) lines.push("LANGUAGE: write the whole page in Arabic, using the Arabic keyword phrases. Only the brand name and phone numbers stay in Latin characters.")
  if (ids.has("readability")) {
    const hints = readabilityHints(page)
    lines.push(
      `READABILITY: reach reading ease ${readingTarget(options.serpBrief)}. Sentences average ${hints.averageSentence} words; aim for 8 to 14 and never more than 20.${hints.long.length ? ` Rewrite these as two or three short sentences each: ${hints.long.map((t) => `"${t}"`).join(" ")}` : ""}${hints.hard.length ? ` Replace these long words with simpler ones where you can: ${hints.hard.join(", ")}.` : ""} Keep the same facts and keep the length.`
    )
  }
  return { failed, lines }
}

/** Lower is better: hard checks failed first, then how far the length is from the aim. */
export function pageRank(page: LandingPage, options: Pick<LandingOptions, "primaryKeyword" | "secondaryKeywords" | "serpBrief">, lang: "en" | "ar", req: Requirements) {
  return [failedHardChecks(checkLandingPage(page, options, lang)).length, Math.abs(landingWordCount(page) - req.words.aim)] as const
}

export const betterThan = (a: readonly [number, number], b: readonly [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
