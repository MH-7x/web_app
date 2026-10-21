/** Types, validation and the text "units" the humanizer works on. No server imports, so the UI can use them. */

import {
  BadRequestError,
  GBP_MAX_CHARS,
  META_DESCRIPTION_MAX,
  normalizeResult,
  pageLabel,
  type ContentType,
  type ResultMap,
} from "@/lib/content-types"

export const STRICTNESS = [
  { id: "light", label: "Light", hint: "Fix the obvious tells and keep your wording." },
  { id: "medium", label: "Medium", hint: "Rewrite stiff sentences and vary the rhythm." },
  { id: "strict", label: "Strict", hint: "Rebuild it in a natural voice, then audit and revise." },
] as const
export type Strictness = (typeof STRICTNESS)[number]["id"]

export const PASTE_MAX_CHARS = 20000

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

export function parseStrictness(value: unknown): Strictness {
  return STRICTNESS.find((s) => s.id === value)?.id ?? "medium"
}

export type HumanizeRequest = { text: string; strictness: Strictness }

export function parseHumanizeRequest(raw: unknown): HumanizeRequest {
  const o = isObject(raw) ? raw : {}
  const text = typeof o.text === "string" ? o.text.trim() : ""
  if (!text) throw new BadRequestError("Paste some text to humanize.")
  if (text.length > PASTE_MAX_CHARS) throw new BadRequestError(`That text is too long. The limit is ${PASTE_MAX_CHARS.toLocaleString()} characters.`)
  return { text, strictness: parseStrictness(o.strictness) }
}

/* ------------------------------------------------------------------ units */

/** One piece of prose inside a generated result that the humanizer can rewrite on its own. */
export type Unit = {
  /** stable within one result: "en", "ar:faq:3", "en:body" */
  key: string
  lang: "en" | "ar"
  label: string
  text: string
  /** the rewrite must not grow past this */
  maxChars?: number
}

const LANG_NAME = { en: "English", ar: "Arabic" } as const
const clip = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s)

/**
 * The prose in a result. Only the sentences that read like AI copy are listed: GBP descriptions, FAQ answers,
 * blog bodies and meta descriptions. Questions, titles, headings-as-titles and page names are left as written.
 */
export function unitsOf<T extends ContentType>(type: T, result: ResultMap[T]): Unit[] {
  const units: Unit[] = []
  for (const lang of ["en", "ar"] as const) {
    const v = result[lang]
    if (v === undefined) continue
    const tag = result.en !== undefined && result.ar !== undefined ? ` (${LANG_NAME[lang]})` : ""
    if (type === "gbp") {
      units.push({ key: lang, lang, label: `GBP Description${tag}`, text: v as string, maxChars: GBP_MAX_CHARS })
    } else if (type === "faq") {
      ;(v as ResultMap["faq"]["en"] & object).forEach((f, i) =>
        units.push({ key: `${lang}:faq:${i}`, lang, label: `FAQ Item ${i + 1}${tag}: ${clip(f.question)}`, text: f.answer })
      )
    } else if (type === "blog") {
      const post = v as ResultMap["blog"]["en"] & object
      units.push({ key: `${lang}:body`, lang, label: `Blog Post${tag}: ${clip(post.title)}`, text: post.body })
    } else if (type === "meta") {
      ;(v as ResultMap["meta"]["en"] & object).forEach((m, i) =>
        units.push({ key: `${lang}:meta:${i}`, lang, label: `Meta Description${tag}: ${clip(pageLabel(m.page))}`, text: m.description, maxChars: META_DESCRIPTION_MAX })
      )
    }
  }
  return units.filter((u) => u.text.trim())
}

/** A copy of `result` with the given units' text replaced. Unknown keys are ignored. */
export function applyUnits<T extends ContentType>(type: T, result: ResultMap[T], texts: Record<string, string>): ResultMap[T] {
  const next = structuredClone(result) as Record<"en" | "ar", unknown>
  for (const [key, text] of Object.entries(texts)) {
    const [lang, part, index] = key.split(":") as ["en" | "ar", string | undefined, string | undefined]
    if (lang !== "en" && lang !== "ar") continue
    const v = next[lang]
    if (v === undefined) continue
    if (type === "gbp" && part === undefined) next[lang] = text
    else if (type === "faq" && part === "faq") {
      const item = (v as { answer: string }[])[Number(index)]
      if (item) item.answer = text
    } else if (type === "blog" && part === "body") (v as { body: string }).body = text
    else if (type === "meta" && part === "meta") {
      const item = (v as { description: string }[])[Number(index)]
      if (item) item.description = text
    }
  }
  return next as ResultMap[T]
}

/** Parse a `{type, result}` pair sent by the Content preview. */
export function parseContentPayload(type: unknown, result: unknown) {
  if (type !== "gbp" && type !== "faq" && type !== "blog" && type !== "meta") throw new BadRequestError("Unknown content type.")
  const normalized = normalizeResult(type, result)
  if (!normalized) throw new BadRequestError("The content is not in the expected format.")
  return { type: type as ContentType, result: normalized }
}

/* ----------------------------------------------------------------- wire */

export type UnitOutcome = {
  key: string
  lang: "en" | "ar"
  label: string
  before: string
  after: string
  beforeScore: number
  afterScore: number
  warnings: string[]
}

export type ContentOutcome = { type: ContentType; result: unknown; units: UnitOutcome[] }

export const scoreTone = (score: number) => (score >= 70 ? "high" : score >= 40 ? "mid" : "low") as "high" | "mid" | "low"
