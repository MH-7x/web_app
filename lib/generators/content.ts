import { SchemaType, type ResponseSchema } from "@google/generative-ai"

import type { ClientDetail } from "@/lib/clients"
import {
  META_DESCRIPTION_MAX,
  META_TITLE_MAX,
  languagesFor,
  pageLabel,
  type BlogOptions,
  type BlogPost,
  type FaqItem,
  type FaqOptions,
  type GbpOptions,
  type Language,
  type Localized,
  type MetaEntry,
  type MetaOptions,
} from "@/lib/content-types"
import { CATEGORY_INFO } from "@/lib/constants"
import { GeminiError, generateJSON, generateText } from "@/lib/gemini"
import { loadTemplate } from "@/lib/prompts/store"
import { LANGUAGE_RULE, NO_INVENTING, areas, categoryContext, clientBrief, services, tone, type Lang } from "@/lib/prompts/shared"

/* ---------------------------------------------------------------- helpers */

const joinLangs = <T>(entries: [Lang, T][]): Localized<T> => Object.fromEntries(entries) as Localized<T>

async function perLanguage<T>(language: Language, run: (lang: Lang) => Promise<T>): Promise<Localized<T>> {
  const langs = languagesFor(language)
  const values = await Promise.all(langs.map(run))
  return joinLangs(langs.map((lang, i) => [lang, values[i]]))
}

/** Variables every client-facing template can use. */
const commonVars = (client: ClientDetail, lang: Lang) => ({
  client_name: client.name,
  client_name_ar: client.nameAr,
  emirate: client.emirate,
  tone: tone(client),
  client_brief: clientBrief(client),
  category_context: categoryContext(client),
  language_rule: LANGUAGE_RULE[lang],
  no_inventing: NO_INVENTING,
})

/* -------------------------------------------------------------------- GBP */

async function gbpSystemPrompt(client: ClientDetail, lang: Lang, { highlights, maxChars }: GbpOptions) {
  return (await loadTemplate("gbp-description")).render(
    {
      client_name: client.name,
      client_name_ar: client.nameAr,
      emirate: client.emirate,
      services: services(client),
      areas: areas(client),
      max_chars: maxChars,
      tone: tone(client),
      category_context: categoryContext(client),
      language_rule: LANGUAGE_RULE[lang],
      highlights: highlights.join("; "),
      no_inventing: NO_INVENTING,
    },
    lang
  )
}

async function gbpFor(client: ClientDetail, lang: Lang, options: GbpOptions) {
  const system = await gbpSystemPrompt(client, lang, options)
  let text = await generateText("Write the Google Business Profile description now.", { systemInstruction: system, temperature: 0.8 })

  // The limit is hard on Google's side, so ask the model to tighten rather than cutting mid-sentence.
  for (let attempt = 0; attempt < 2 && text.length > options.maxChars; attempt++) {
    text = await generateText(
      `This draft is ${text.length} characters, over the ${options.maxChars} limit. Rewrite it at ${Math.max(200, options.maxChars - 40)} characters or fewer, keeping the company name, main services, areas and the WhatsApp CTA. Return only the rewritten text.\n\n${text}`,
      { systemInstruction: system, temperature: 0.4 }
    )
  }
  return text
}

export function generateGBP(client: ClientDetail, language: Language, options: GbpOptions) {
  return perLanguage(language, (lang) => gbpFor(client, lang, options))
}

/* -------------------------------------------------------------------- FAQ */

const FAQ_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: { question: { type: SchemaType.STRING }, answer: { type: SchemaType.STRING } },
        required: ["question", "answer"],
      },
    },
  },
  required: ["items"],
}

async function faqFor(client: ClientDetail, lang: Lang, count: number, topic: string): Promise<FaqItem[]> {
  const system = (await loadTemplate("faq-generation")).render(commonVars(client, lang), lang)

  const prompt = topic
    ? `Write exactly ${count} FAQ items focused on this topic: ${topic}.`
    : `Write exactly ${count} FAQ items covering the most common questions about hiring this company.`

  const data = await generateJSON<{ items?: FaqItem[] }>(prompt, FAQ_SCHEMA, { systemInstruction: system, temperature: 0.7 })
  const items = (data.items ?? [])
    .filter((i) => i?.question?.trim() && i?.answer?.trim())
    .map((i) => ({ question: i.question.trim(), answer: i.answer.trim() }))
    .slice(0, count)
  if (!items.length) throw new GeminiError("bad_response", "Gemini returned no FAQ items. Try again.", 502)
  return items
}

export function generateFAQ(client: ClientDetail, language: Language, { count, topic }: FaqOptions) {
  return perLanguage(language, (lang) => faqFor(client, lang, count, topic))
}

/* ------------------------------------------------------------------- Blog */

const BLOG_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING },
    metaDescription: { type: SchemaType.STRING },
    body: { type: SchemaType.STRING },
  },
  required: ["title", "metaDescription", "body"],
}

async function blogFor(client: ClientDetail, lang: Lang, { topic, keyword, wordCount }: BlogOptions): Promise<BlogPost> {
  const system = (await loadTemplate("blog-post")).render(commonVars(client, lang), lang)

  const prompt = [
    `Write a blog post about: ${topic}.`,
    keyword ? `Target keyword: "${keyword}". Use it in the title, in the first 100 words and in one heading, then naturally elsewhere. No stuffing.` : "",
    `Length: about ${wordCount} words for the body.`,
    "Also write a meta description of 155 characters or fewer.",
  ]
    .filter(Boolean)
    .join("\n")

  const data = await generateJSON<Partial<BlogPost>>(prompt, BLOG_SCHEMA, { systemInstruction: system, temperature: 0.8 })
  if (!data.title?.trim() || !data.body?.trim()) throw new GeminiError("bad_response", "Gemini returned an incomplete blog post. Try again.", 502)
  return { title: data.title.trim(), body: data.body.trim(), metaDescription: (data.metaDescription ?? "").trim() }
}

export function generateBlog(client: ClientDetail, language: Language, options: BlogOptions) {
  return perLanguage(language, (lang) => blogFor(client, lang, options))
}

/* ------------------------------------------------------------------- Meta */

const META_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    pages: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          page: { type: SchemaType.STRING },
          title: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
        },
        required: ["page", "title", "description"],
      },
    },
  },
  required: ["pages"],
}

function describePage(client: ClientDetail, page: string) {
  if (page.startsWith("service:")) return `Individual service page for "${page.slice(8)}" in ${client.emirate}`
  if (page.startsWith("area:")) return `Location page: ${client.category === "moving" ? "moving services" : CATEGORY_INFO[client.category].label.toLowerCase()} in ${page.slice(5)}, ${client.emirate}`
  const known: Record<string, string> = {
    home: "Homepage",
    services: "Main services hub page that introduces and links to every individual service",
    about: "About us page",
    contact: "Contact / get a quote page",
  }
  return known[page] ?? pageLabel(page)
}

const violations = (entries: MetaEntry[]) =>
  entries.filter((e) => e.title.length > META_TITLE_MAX || e.description.length > META_DESCRIPTION_MAX).length

async function metaFor(client: ClientDetail, lang: Lang, pages: string[]): Promise<MetaEntry[]> {
  const system = (await loadTemplate("meta-tags")).render({ ...commonVars(client, lang), title_max: META_TITLE_MAX, description_max: META_DESCRIPTION_MAX }, lang)

  const prompt = `Write the title and description for each page below. Echo each page id exactly in the "page" field.\n${pages
    .map((p) => `- ${p}: ${describePage(client, p)}`)
    .join("\n")}`

  const attempt = async () => {
    const data = await generateJSON<{ pages?: MetaEntry[] }>(prompt, META_SCHEMA, { systemInstruction: system, temperature: 0.6 })
    const returned = data.pages ?? []
    // match by id, fall back to position
    return pages.map<MetaEntry>((page, i) => {
      const hit = returned.find((r) => r?.page?.trim().toLowerCase() === page.toLowerCase()) ?? returned[i]
      return { page, title: (hit?.title ?? "").trim(), description: (hit?.description ?? "").trim() }
    })
  }

  let best = await attempt()
  // one more try if anything is over the limit; keep whichever draft is better
  if (violations(best) > 0) {
    const retry = await attempt()
    if (violations(retry) < violations(best)) best = retry
  }
  if (best.every((e) => !e.title && !e.description)) throw new GeminiError("bad_response", "Gemini returned no meta tags. Try again.", 502)
  return best
}

export function generateMeta(client: ClientDetail, language: Language, { pages }: MetaOptions) {
  return perLanguage(language, (lang) => metaFor(client, lang, pages))
}
