/** Types and helpers shared by the generators, the API routes and the Content UI. No server imports. */

export const LANGUAGES = ["en", "ar", "both"] as const
export type Language = (typeof LANGUAGES)[number]

export type ContentType = "gbp" | "faq" | "blog" | "meta"
export const CONTENT_MODULE_TYPES: ContentType[] = ["gbp", "faq", "blog", "meta"]

export type Localized<T> = { en?: T; ar?: T }
export type FaqItem = { question: string; answer: string }
export type BlogPost = { title: string; metaDescription: string; body: string }
export type MetaEntry = { page: string; title: string; description: string }

export type ResultMap = {
  gbp: Localized<string>
  faq: Localized<FaqItem[]>
  blog: Localized<BlogPost>
  meta: Localized<MetaEntry[]>
}

export type GbpOptions = { highlights: string[]; maxChars: number }
export type FaqOptions = { count: number; topic: string }
export type BlogOptions = { topic: string; keyword: string; wordCount: number }
export type MetaOptions = { pages: string[] }

export const GBP_MAX_CHARS = 750
export const META_TITLE_MAX = 60
export const META_DESCRIPTION_MAX = 160
export const FAQ_COUNT = { min: 5, max: 20, default: 10 }
export const BLOG_WORD_COUNTS = [600, 900, 1200, 1500] as const
export const GBP_HIGHLIGHTS = [
  "24/7 moving service",
  "Licensed & insured",
  "No hidden fees",
  "Free moving estimates",
  "Dismantling & assembly",
  "Same-day moves",
  "Packing materials included",
  "Storage available",
] as const

/**
 * Pages offered for meta tags, in site order: Home, the Services hub, one page per client service,
 * About, Contact, then one page per area served. Page ids: home | services | service:<name> | about | contact | area:<name>.
 */
export function metaPageChoices(client: { services: string[]; areas: string[] }) {
  return [
    { id: "home", label: "Home" },
    { id: "services", label: "Services (Main Services Hub)" },
    ...client.services.map((s) => ({ id: `service:${s}`, label: s })),
    { id: "about", label: "About" },
    { id: "contact", label: "Contact" },
    ...client.areas.map((a) => ({ id: `area:${a}`, label: a })),
  ]
}

/** Languages to generate for a request. */
export const languagesFor = (language: Language): ("en" | "ar")[] => (language === "both" ? ["en", "ar"] : [language])

export function pageLabel(page: string) {
  if (page.startsWith("area:")) return `${page.slice(5)} (area page)`
  if (page.startsWith("service:")) return `${page.slice(8)} (service page)`
  if (page === "services") return "Services (Main Services Hub)"
  return page.charAt(0).toUpperCase() + page.slice(1)
}

/* ------------------------------------------------------------- validation */

/** Thrown for malformed requests; routes answer 400 with the message. */
export class BadRequestError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export function parseLanguage(value: unknown): Language {
  if ((LANGUAGES as readonly unknown[]).includes(value)) return value as Language
  throw new BadRequestError("Language must be 'en', 'ar' or 'both'.")
}

export function parseOptions<T extends ContentType>(type: T, raw: unknown): OptionsMap[T]
export function parseOptions(type: ContentType, raw: unknown): OptionsMap[ContentType] {
  const o = isObject(raw) ? raw : {}
  switch (type) {
    case "gbp":
      return {
        highlights: Array.isArray(o.highlights)
          ? [...new Set(o.highlights.map(str).filter(Boolean))].slice(0, 12).map((h) => h.slice(0, 80))
          : [],
        maxChars: clamp(Math.round(Number(o.maxChars) || GBP_MAX_CHARS), 200, GBP_MAX_CHARS),
      }
    case "faq":
      return {
        count: clamp(Math.round(Number(o.count) || FAQ_COUNT.default), FAQ_COUNT.min, FAQ_COUNT.max),
        topic: str(o.topic).slice(0, 200),
      }
    case "blog": {
      const topic = str(o.topic).slice(0, 200)
      if (!topic) throw new BadRequestError("Enter a blog topic.")
      const wordCount = Number(o.wordCount)
      return {
        topic,
        keyword: str(o.keyword).slice(0, 100),
        wordCount: (BLOG_WORD_COUNTS as readonly number[]).includes(wordCount) ? wordCount : 900,
      }
    }
    case "meta": {
      const pages = Array.isArray(o.pages) ? [...new Set(o.pages.map(str).filter(Boolean))].slice(0, 20) : []
      if (!pages.length) throw new BadRequestError("Select at least one page.")
      return { pages: pages.map((p) => p.slice(0, 100)) }
    }
  }
}

export type OptionsMap = { gbp: GbpOptions; faq: FaqOptions; blog: BlogOptions; meta: MetaOptions }

/** Validate a (possibly user-edited) result of the given type; null when the shape is wrong. */
export function normalizeResult<T extends ContentType>(type: T, raw: unknown): ResultMap[T] | null
export function normalizeResult(type: ContentType, raw: unknown): ResultMap[ContentType] | null {
  if (!isObject(raw)) return null
  const out: Record<string, unknown> = {}
  for (const lang of ["en", "ar"] as const) {
    const v = raw[lang]
    if (v === undefined || v === null) continue
    let value: unknown = null
    if (type === "gbp") value = typeof v === "string" ? v : null
    else if (type === "faq")
      value =
        Array.isArray(v) && v.every((i) => isObject(i) && typeof i.question === "string" && typeof i.answer === "string")
          ? v.map((i) => ({ question: String(i.question), answer: String(i.answer) }))
          : null
    else if (type === "blog")
      value =
        isObject(v) && typeof v.title === "string" && typeof v.body === "string"
          ? { title: v.title, body: v.body, metaDescription: typeof v.metaDescription === "string" ? v.metaDescription : "" }
          : null
    else if (type === "meta")
      value =
        Array.isArray(v) && v.every((i) => isObject(i) && typeof i.page === "string" && typeof i.title === "string" && typeof i.description === "string")
          ? v.map((i) => ({ page: String(i.page), title: String(i.title), description: String(i.description) }))
          : null
    if (value === null) return null
    out[lang] = value
  }
  return out.en === undefined && out.ar === undefined ? null : (out as ResultMap[ContentType])
}

/* ---------------------------------------------------------------- render */

/** Plain-text / markdown rendering of one language's result, stored in GeneratedContent.content. */
export function renderText<T extends ContentType>(type: T, value: NonNullable<ResultMap[T][keyof ResultMap[T]]>): string
export function renderText(type: ContentType, value: unknown): string {
  switch (type) {
    case "gbp":
      return value as string
    case "faq":
      return (value as FaqItem[]).map((f, i) => `**${i + 1}. ${f.question}**\n${f.answer}`).join("\n\n")
    case "blog": {
      const post = value as BlogPost
      return `# ${post.title}\n\n${post.body}`
    }
    case "meta":
      return (value as MetaEntry[])
        .map((m) => `### ${pageLabel(m.page)}\nTitle: ${m.title}\nDescription: ${m.description}`)
        .join("\n\n")
  }
}

/** Map a result to the columns of GeneratedContent. English goes in `content` unless Arabic is all there is. */
export function toColumns<T extends ContentType>(type: T, result: ResultMap[T]) {
  const text = (lang: "en" | "ar") => {
    const v = result[lang]
    return v === undefined ? null : renderText(type, v as never)
  }
  const en = text("en")
  const ar = text("ar")
  return { content: en ?? ar ?? "", contentAr: en !== null ? ar : null }
}

/** The result as the Content UI wants it, rebuilt from a GeneratedContent row's metadata. */
export function resultFromMetadata(type: ContentType, metadata: unknown) {
  return isObject(metadata) ? normalizeResult(type, metadata.result) : null
}
