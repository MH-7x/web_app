import { SchemaType, type ResponseSchema } from "@google/generative-ai"

import type { ClientDetail } from "@/lib/clients"
import {
  GBP_POST_MAX,
  POSTS_PER_WEEK,
  POST_CATEGORIES,
  addDays,
  categoryLabel,
  longDayLabel,
  weekStart,
  type PostCategory,
  type PostLanguage,
} from "@/lib/gbp-posts-types"
import type { ClientCategory } from "@/lib/constants"
import { GeminiError, generateJSON, generateText } from "@/lib/gemini"
import { loadTemplate } from "@/lib/prompts/store"
import { NO_INVENTING, categoryContext, clientBrief, tone } from "@/lib/prompts/shared"
import { getCategoryFallbackServices, getCategoryImageGuide, getCategoryTip } from "@/lib/prompts/templates"

/** One post to write: when it goes out, which angle it takes, what to focus on and which keywords it must cover. */
export type PostSlot = { date: string; category: PostCategory; service: string; area: string; keywords: string[] }

export type GeneratedPost = PostSlot & {
  language: PostLanguage
  postType: "whats-new" | "offer"
  cta: "call" | "learn-more" | "book"
  /** empty when that language was not requested */
  textAr: string
  textEn: string
  imagePrompt: string
}

const BATCH = 3
const CONCURRENCY = 2
const CTA_VALUES = ["call", "learn-more", "book"] as const

const CATEGORY_GUIDE: Record<PostCategory, string> = {
  "service-highlight": "Spotlight one service: what the crew actually does, step by step, and who it suits.",
  "customer-tip": "A genuinely useful moving tip for UAE residents (permits, building rules, packing, timing). Teach something; the company is only mentioned lightly.",
  "seasonal-offer":
    "Tie into what is happening around the post date in the UAE (summer heat, Ramadan and Eid, school year, lease renewals, year-end). Offer a soft incentive such as a free moving estimate or booking early; never invent a discount, price or deadline.",
  "area-specific": "Written for one neighbourhood: name it, mention what makes moving there particular (access, parking, building rules), and say the company covers it.",
  "trust-signal": "Reassure: how the team protects belongings, how quotes work, how to reach the company. Use only facts from the company details, no invented reviews, numbers or awards.",
  "behind-the-scenes": "A short, concrete glimpse of the crew at work (loading, wrapping, truck prep). Sensory and specific, in the first person plural.",
}

const BEHIND_THE_SCENES: Partial<Record<ClientCategory, string>> = {
  used_furniture: "A short, concrete glimpse of the workshop or showroom (restoring a piece, arranging a display, inspecting a delivery). Sensory and specific, in the first person plural.",
  pickup_rental: "A short, concrete glimpse of the fleet at work (a pickup being cleaned and checked before handover, a driver loading, the depot in the morning). Sensory and specific, in the first person plural.",
}

/** The angle guide for one post; the tip and behind-the-scenes angles change with the business category. */
function categoryGuide(client: ClientDetail, category: PostCategory) {
  if (category === "customer-tip") return getCategoryTip(client.category) || CATEGORY_GUIDE[category]
  if (category === "behind-the-scenes") return BEHIND_THE_SCENES[client.category] ?? CATEGORY_GUIDE[category]
  return CATEGORY_GUIDE[category]
}

/** The vehicle or scene the image prompt should start from. */
function imageSubject(client: ClientDetail) {
  if (client.category === "moving") return client.truckType ? `Truck: ${client.truckType}.` : "A white closed-box moving truck."
  const scene = getCategoryImageGuide(client.category)
  return client.category === "pickup_rental" && client.truckType ? `Fleet: ${client.truckType}. ${scene}` : scene
}

const AI_TELLS =
  "look no further, whether you're, seamless, hassle-free, stress-free journey, elevate, unlock, top-notch, state-of-the-art, premier, second to none, your trusted partner, in today's fast-paced world, we understand that, rest assured, game-changer"

function schemaFor(language: PostLanguage): ResponseSchema {
  const text = { type: SchemaType.STRING } as const
  const properties: Record<string, typeof text | { type: SchemaType.ARRAY; items: typeof text }> = {
    ...(language !== "en" ? { textAr: text } : {}),
    ...(language !== "ar" ? { textEn: text } : {}),
    cta: text,
    keywords: { type: SchemaType.ARRAY, items: text },
    imagePrompt: text,
  }
  return {
    type: SchemaType.OBJECT,
    properties: {
      posts: { type: SchemaType.ARRAY, items: { type: SchemaType.OBJECT, properties, required: Object.keys(properties) } },
    },
    required: ["posts"],
  }
}

async function system(client: ClientDetail, language: PostLanguage) {
  const versions =
    language === "both"
      ? "Each post has two versions written separately, never one translated from the other. Arabic is the primary version: natural Modern Standard Arabic with a Gulf-friendly, conversational feel, the way UAE moving companies really write. English is the secondary version."
      : language === "ar"
        ? "Write each post in Arabic only (textAr): natural Modern Standard Arabic with a Gulf-friendly, conversational feel, the way UAE moving companies really write. Do not write an English version."
        : "Write each post in English only (textEn), in clear natural English. Do not write an Arabic version."
  return (await loadTemplate("gbp-posts")).render({
    client_name: client.name,
    client_name_ar: client.nameAr,
    emirate: client.emirate,
    tone: tone(client),
    client_brief: clientBrief(client),
    language_versions: versions,
    post_max: GBP_POST_MAX,
    arabic_keyword_note: language === "en" ? "" : "For Arabic text use the natural Arabic equivalent of an English keyword. ",
    ai_tells: AI_TELLS,
    truck_line: imageSubject(client),
    category_context: categoryContext(client),
    uniform: client.uniform,
    brand_colors_line: client.primaryColor ? `Brand colors: primary ${client.primaryColor}${client.secondaryColor ? `, secondary ${client.secondaryColor}` : ""}.` : "",
    no_inventing: NO_INVENTING,
  })
}

/* --------------------------------------------------------------- keywords */

const STOP = new Set(["in", "the", "a", "an", "of", "for", "and", "to", "near", "me"])

/** True when every meaningful word of the keyword shows up in the text (prefix match, so plurals and inflections count). */
function covers(text: string, keyword: string) {
  const haystack = text.toLowerCase()
  return keyword
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w))
    .every((w) => haystack.includes(w.length > 5 ? w.slice(0, 5) : w))
}

/* ------------------------------------------------------------------ writing */

async function writeBatch(client: ClientDetail, slots: PostSlot[], language: PostLanguage): Promise<GeneratedPost[]> {
  const prompt = [
    `Write exactly ${slots.length} posts, in this order:`,
    ...slots.map(
      (s, i) =>
        `${i + 1}. Goes out ${longDayLabel(s.date)}. Angle: ${categoryLabel(s.category)}. ${categoryGuide(client, s.category)} Focus service: ${s.service}. ${
          s.category === "area-specific" ? `Neighbourhood: ${s.area}.` : `Area to mention if it fits: ${s.area}.`
        } Keywords to cover naturally: ${s.keywords.join("; ")}.`
    ),
    "Make each post clearly different from the others in topic and opening.",
  ].join("\n")

  const data = await generateJSON<{ posts?: { textAr?: string; textEn?: string; cta?: string; keywords?: string[]; imagePrompt?: string }[] }>(prompt, schemaFor(language), {
    systemInstruction: await system(client, language),
    temperature: 0.9,
  })
  const raw = Array.isArray(data.posts) ? data.posts : []

  return slots.map((slot, i) => {
    const p = raw[i]
    const ar = (p?.textAr ?? "").trim()
    const en = (p?.textEn ?? "").trim()
    if ((language !== "en" && !ar) || (language !== "ar" && !en)) throw new GeminiError("bad_response", "Gemini returned incomplete posts. Try again.", 502)
    return {
      ...slot,
      language,
      postType: slot.category === "seasonal-offer" ? "offer" : "whats-new",
      cta: (CTA_VALUES as readonly string[]).includes(p?.cta ?? "") ? (p!.cta as GeneratedPost["cta"]) : "call",
      textAr: language === "en" ? "" : ar,
      textEn: language === "ar" ? "" : en,
      imagePrompt: (p?.imagePrompt ?? "").trim(),
    }
  })
}

/** Rewrite a text that came back over the limit, up to twice, rather than cutting it mid-sentence. */
async function fit(client: ClientDetail, language: PostLanguage, text: string, lang: "ar" | "en") {
  for (let attempt = 0; attempt < 2 && text.length > GBP_POST_MAX; attempt++) {
    text = await generateText(
      `This ${lang === "ar" ? "Arabic" : "English"} Google Business Profile post is ${text.length} characters, over the ${GBP_POST_MAX} limit. Rewrite it at about 900 characters, keeping the same language, keywords, voice and the closing call to action. Return only the rewritten post.\n\n${text}`,
      { systemInstruction: await system(client, language), temperature: 0.4 }
    )
  }
  return text
}

/** If the English text left out some of its keywords, ask for one rewrite that works them in naturally. */
async function ensureKeywords(client: ClientDetail, language: PostLanguage, post: GeneratedPost) {
  if (language === "ar") return post.textEn
  const missing = post.keywords.filter((k) => !covers(post.textEn, k))
  if (!missing.length) return post.textEn
  const revised = await generateText(
    `Rewrite this Google Business Profile post so it also covers these keywords naturally: ${missing.join("; ")}. Change as little else as possible, keep it under ${GBP_POST_MAX} characters, keep the same voice and closing call to action, and do not stuff. Return only the post.\n\n${post.textEn}`,
    { systemInstruction: await system(client, language), temperature: 0.4 }
  ).catch(() => post.textEn)
  return revised.length <= GBP_POST_MAX ? revised : post.textEn
}

async function finish(client: ClientDetail, language: PostLanguage, post: GeneratedPost): Promise<GeneratedPost> {
  const textAr = post.textAr ? await fit(client, language, post.textAr, "ar") : ""
  const textEn = post.textEn ? await fit(client, language, post.textEn, "en") : ""
  const withEn = { ...post, textAr, textEn }
  return { ...withEn, textEn: textEn ? await ensureKeywords(client, language, withEn) : "" }
}

/**
 * Write posts for the given slots, a few at a time. `onBatch` is called with each finished batch so callers can save
 * posts as they arrive; a failure part-way keeps everything already delivered.
 */
export async function writePosts(client: ClientDetail, slots: PostSlot[], language: PostLanguage, onBatch?: (posts: GeneratedPost[], done: number) => Promise<void> | void) {
  const batches: PostSlot[][] = []
  for (let i = 0; i < slots.length; i += BATCH) batches.push(slots.slice(i, i + BATCH))

  const all: GeneratedPost[] = []
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const group = batches.slice(i, i + CONCURRENCY)
    const done = await Promise.all(
      group.map(async (b) => {
        const written = await writeBatch(client, b, language)
        return Promise.all(written.map((p) => finish(client, language, p)))
      })
    )
    for (const posts of done) {
      all.push(...posts)
      await onBatch?.(posts, all.length)
    }
  }
  return all
}

/* ----------------------------------------------------------------- planning */

/** Posting days in order of preference: Monday, Wednesday, Friday, then Tuesday and Thursday if those are taken. */
const DAY_PREFERENCE = [1, 3, 5, 2, 4]

/**
 * Plan exactly POSTS_PER_WEEK posts for each of `weeks` weeks, starting with the week of `startDate`.
 * Days already holding a post are left alone; a week that already has three posts is skipped, and a week with fewer
 * is topped up to three. A week that cannot fit three posts on or after `startDate` is skipped so no week gets fewer.
 * Keywords are spread so every keyword appears in at least one post.
 */
export function planSlots(client: ClientDetail, weeks: number, startDate: string, keywords: string[], existingDates: string[] = []): PostSlot[] {
  const services = client.services.length ? client.services : [client.category === "moving" ? "moving services" : getCategoryFallbackServices(client.category)]
  const areas = client.areas.length ? client.areas : [client.emirate]
  const taken = new Set(existingDates)
  const slots: PostSlot[] = []

  let filled = 0
  for (let week = weekStart(startDate), guard = 0; filled < weeks && guard < 60; week = addDays(week, 7), guard++) {
    const have = Array.from({ length: 7 }, (_, d) => addDays(week, d)).filter((d) => taken.has(d)).length
    const need = POSTS_PER_WEEK - have
    if (need <= 0) continue
    const free = DAY_PREFERENCE.map((d) => addDays(week, d)).filter((d) => d >= startDate && !taken.has(d))
    if (free.length < need) continue
    for (const date of free.slice(0, need).sort()) slots.push({ date, category: "service-highlight", service: "", area: "", keywords: [] })
    filled++
  }

  // spread the keywords: each post covers a few, rotating, so all of them are used somewhere
  const perPost = keywords.length ? Math.min(keywords.length, Math.max(2, Math.ceil(keywords.length / Math.max(1, slots.length)))) : 0
  return slots.map((slot, n) => ({
    ...slot,
    category: POST_CATEGORIES[n % POST_CATEGORIES.length].id,
    service: services[n % services.length],
    area: areas[n % areas.length],
    keywords: Array.from({ length: perPost }, (_, k) => keywords[(n * perPost + k) % keywords.length]),
  }))
}

/** A fresh version of one existing post: same day, angle and keywords, new text and image prompt. */
export async function regeneratePost(client: ClientDetail, slot: PostSlot, language: PostLanguage) {
  return (await writePosts(client, [slot], language))[0]
}
