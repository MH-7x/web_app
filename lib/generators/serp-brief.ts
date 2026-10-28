import { SchemaType, type ResponseSchema } from "@google/generative-ai"

import type { ClientDetail } from "@/lib/clients"
import { buildBenchmark, normalizeSerpBrief, type CompetitorBenchmark, type CompetitorSummary, type SerpBrief } from "@/lib/competitor-types"
import { GeminiError, generateJSON } from "@/lib/gemini"
import type { LandingOptions } from "@/lib/landing-page-types"
import { PAGE_TYPES } from "@/lib/landing-page-types"
import { categoryContext } from "@/lib/prompts/shared"
import { loadTemplate } from "@/lib/prompts/store"

const text: ResponseSchema = { type: SchemaType.STRING }
const list: ResponseSchema = { type: SchemaType.ARRAY, items: text }
const int: ResponseSchema = { type: SchemaType.INTEGER }

const BRIEF_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    intent: text,
    winningPattern: text,
    commonSections: list,
    contentGaps: list,
    faqThemes: list,
    differentiation: list,
    recommendedWordCount: { type: SchemaType.OBJECT, properties: { min: int, max: int }, required: ["min", "max"] },
    recommendedImageCount: int,
    notes: text,
  },
  required: ["intent", "winningPattern", "commonSections", "contentGaps", "faqThemes", "differentiation", "recommendedWordCount", "recommendedImageCount", "notes"],
}

/** Website text must not be able to close the data block the prompt wraps it in. */
const safe = (s: string) => s.replace(/[<>]/g, "").replace(/\s+/g, " ").trim()

function benchmarkText(b: CompetitorBenchmark) {
  return [
    `Pages read: ${b.pages}`,
    `Median word count: ${b.wordCountMedian}`,
    `Median number of H2 headings: ${b.h2Median}`,
    `Median number of content images: ${b.imageMedian}`,
    `Median number of FAQ questions: ${b.faqMedian}`,
    `Pages with an FAQ: ${b.faqPercent}%, with a process section: ${b.processPercent}%, with visible reviews: ${b.reviewsPercent}%, with structured data: ${b.schemaPercent}%`,
    `Pages with a call button: ${b.telPercent}%, a WhatsApp button: ${b.whatsappPercent}%, a form: ${b.formPercent}%`,
    `Primary keyword in the title on ${b.keywordInTitlePercent}% of pages and in the H1 on ${b.keywordInH1Percent}%`,
    b.readingEaseMedian !== null && `Median reading ease (English pages): ${b.readingEaseMedian}`,
  ]
    .filter(Boolean)
    .join("\n")
}

/** The structure of each page, with no body copy: titles, headings, questions and measurements. */
function competitorData(pages: CompetitorSummary[]) {
  return pages
    .map((p, i) =>
      [
        `PAGE ${i + 1} (${p.language === "ar" ? "Arabic" : "English"}, ${p.wordCount} words, ${p.images.count} images)`,
        `Title: ${safe(p.title)}`,
        `Meta description: ${safe(p.metaDescription)}`,
        `H1: ${safe(p.h1)}`,
        `Headings:\n${p.outline.map((o) => `${o.level === 2 ? "-" : "  -"} ${safe(o.text)}`).join("\n") || "(none)"}`,
        p.faqQuestions.length && `FAQ questions: ${p.faqQuestions.map(safe).join(" | ")}`,
        `Calls to action: ${[p.ctas.tel && "call button", p.ctas.whatsapp && "WhatsApp", p.ctas.form && "form"].filter(Boolean).join(", ") || "none seen"}`,
        `Has FAQ: ${p.hasFaq ? "yes" : "no"}; process section: ${p.hasProcess ? "yes" : "no"}; visible reviews: ${p.hasReviews ? "yes" : "no"}; map: ${p.hasMap ? "yes" : "no"}`,
        p.schemaTypes.length && `Structured data: ${p.schemaTypes.join(", ")}`,
        `Keyword: in title ${p.keyword.inTitle ? "yes" : "no"}, in H1 ${p.keyword.inH1 ? "yes" : "no"}, in first 100 words ${p.keyword.inFirst100 ? "yes" : "no"}, used ${p.keyword.uses} times (${p.keyword.density}%)`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n")
}

const MAX_IMAGES = 12

export type BriefInput = Pick<LandingOptions, "primaryKeyword" | "secondaryKeywords" | "emirate" | "service" | "area" | "pageType">

/** Brief the writer from the pages that rank: intent, structure, gaps, length. The measured figures come from the pages, not from the model. */
export async function generateSerpBrief(client: ClientDetail, input: BriefInput, pages: CompetitorSummary[]): Promise<SerpBrief> {
  if (!pages.length) throw new GeminiError("bad_response", "There are no competitor pages to analyze.", 400)
  const benchmark = buildBenchmark(pages)
  const system = (await loadTemplate("serp-analysis")).render({
    client_name: client.name,
    emirate: client.emirate,
    category_context: categoryContext(client),
    page_type: PAGE_TYPES.find((p) => p.value === input.pageType)?.label ?? input.pageType,
    service: input.service,
    area: input.area,
    target_emirate: input.emirate,
    primary_keyword: input.primaryKeyword,
    secondary_keywords: input.secondaryKeywords.join(", "),
    pages_count: pages.length,
    benchmark: benchmarkText(benchmark),
    competitor_data: competitorData(pages),
  })

  const data = await generateJSON<unknown>("Analyze the competitor pages and return the brief as JSON in the structure described.", BRIEF_SCHEMA, { systemInstruction: system, temperature: 0.3 })
  const brief = normalizeSerpBrief({ ...(data as object), benchmark, sources: pages.map((p) => p.url) })
  if (!brief) throw new GeminiError("bad_response", "Gemini returned an incomplete competitor analysis. Try again.", 502)

  // the model is asked for a range; if it skipped one, fall back to the measured median
  if (brief.recommendedWordCount.max === 0 && benchmark.wordCountMedian > 0) {
    brief.recommendedWordCount = { min: Math.round(benchmark.wordCountMedian * 0.85), max: Math.round(benchmark.wordCountMedian * 1.3) }
  }
  // every image has to be a real photo from the client, and competitors pad pages with decorative ones
  brief.recommendedImageCount = Math.min(MAX_IMAGES, Math.max(5, brief.recommendedImageCount || benchmark.imageMedian || 8))
  return brief
}
