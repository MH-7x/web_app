import { SchemaType, type ResponseSchema } from "@google/generative-ai"

import {
  AD_LIMITS,
  FB_CTAS,
  type FacebookRequest,
  type FacebookResult,
  type FbAd,
  type FbObjective,
} from "@/lib/ads-types"
import { normalizeUaeNumber, toE164 } from "@/lib/client-schema"
import type { ClientCategory } from "@/lib/constants"
import type { ClientDetail } from "@/lib/clients"
import { languagesFor, type Language, type Localized } from "@/lib/content-types"
import { GeminiError, generateJSON } from "@/lib/gemini"
import { loadTemplate } from "@/lib/prompts/store"
import { LANGUAGE_RULE, NO_INVENTING, categoryContext, clientBrief, type Lang } from "@/lib/prompts/shared"

/* --------------------------------------------------------------- helpers */

/** Run async jobs with a cap on how many are in flight, so a big batch doesn't trip rate limits. */
function limiter(max: number) {
  let active = 0
  const queue: (() => void)[] = []
  const next = () => {
    active--
    queue.shift()?.()
  }
  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve))
    active++
    try {
      return await job()
    } finally {
      next()
    }
  }
}

const adsBrief = (client: ClientDetail) => `${clientBrief(client)}\nOther emirates served: ${client.emiratesServed.join(", ") || "none"}`

/* --------------------------------------------------------------- Facebook */

const FB_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    ads: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          primaryText: { type: SchemaType.STRING },
          headline: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
          ctaType: { type: SchemaType.STRING },
          whatsappMessage: { type: SchemaType.STRING },
        },
        required: ["primaryText", "headline", "description", "ctaType", "whatsappMessage"],
      },
    },
  },
  required: ["ads"],
}

const OBJECTIVE_GUIDE: Record<FbObjective, string> = {
  traffic: "Traffic: get people to click through to the website. Lean on what they will find there (services, quote form).",
  messages: "Messages: get people to start a WhatsApp conversation for a quote. Make messaging feel instant and low-effort.",
  conversions: "Conversions: get people to request a quote or book. Remove doubt (transparent pricing, clear next step).",
}

/** 0xx xxx xxxx style, as UAE businesses write numbers in ads. */
function localPhone(e164: string) {
  const n = normalizeUaeNumber(e164)
  return n.length >= 8 ? `0${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}` : e164
}

const DEFAULT_WA_MESSAGE: Record<ClientCategory, Record<Lang, (emirate: string) => string>> = {
  moving: {
    en: (e) => `Hi, I'd like a free moving quote in ${e}.`,
    ar: (e) => `مرحباً، أرغب في الحصول على عرض سعر مجاني لنقل الأثاث في ${e}.`,
  },
  used_furniture: {
    en: (e) => `Hi, I'm interested in used furniture in ${e}. What do you have available?`,
    ar: (e) => `مرحباً، أبحث عن أثاث مستعمل في ${e}. ما المتوفر لديكم؟`,
  },
  pickup_rental: {
    en: (e) => `Hi, I'd like the rates for renting a pickup in ${e}.`,
    ar: (e) => `مرحباً، أرغب في معرفة أسعار تأجير بيك أب في ${e}.`,
  },
}

async function fbSystem(client: ClientDetail, lang: Lang, emirate: string, objective: FbObjective, count: number) {
  const site = client.website?.replace(/^https?:\/\//, "").replace(/\/$/, "")
  return (await loadTemplate("fb-ad")).render(
    {
      count,
      client_name: client.name,
      client_name_ar: client.nameAr,
      emirate,
      objective_guide: OBJECTIVE_GUIDE[objective],
      language_rule: LANGUAGE_RULE[lang],
      headline_max: AD_LIMITS.fbHeadline,
      description_max: AD_LIMITS.fbDescription,
      cta_types: FB_CTAS[objective].join(", "),
      whatsapp_local: localPhone(client.whatsapp),
      phone_local: localPhone(client.phone),
      website: site,
      company_details: adsBrief(client),
      category_context: categoryContext(client),
      no_inventing: NO_INVENTING,
    },
    lang
  )
}

type RawFbAd = { primaryText?: string; headline?: string; description?: string; ctaType?: string; whatsappMessage?: string }

const fbViolates = (a: RawFbAd) => (a.headline ?? "").length > AD_LIMITS.fbHeadline || (a.description ?? "").length > AD_LIMITS.fbDescription

async function fbAdsFor(client: ClientDetail, lang: Lang, emirate: string, objective: FbObjective, offer: string, audience: string, count: number): Promise<FbAd[]> {
  const system = await fbSystem(client, lang, emirate, objective, count)
  const prompt = [
    `Write exactly ${count} ad variations.`,
    offer ? `Offer to feature: ${offer}` : "No special offer: do not invent one.",
    audience ? `Audience notes: ${audience}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const data = await generateJSON<{ ads?: RawFbAd[] }>(prompt, FB_SCHEMA, { systemInstruction: system, temperature: 0.9 })
  let ads = (Array.isArray(data.ads) ? data.ads : []).filter((a) => a?.primaryText?.trim() && a?.headline?.trim()).slice(0, count)
  if (!ads.length) throw new GeminiError("bad_response", "Gemini returned no ads. Try again.", 502)

  // headline/description over the limit: have the model rewrite just those, up to twice
  for (let round = 0; round < 2; round++) {
    const bad = ads.map((a, index) => ({ a, index })).filter(({ a }) => fbViolates(a))
    if (!bad.length) break
    const fixPrompt = `These ads break a length limit (headline max ${AD_LIMITS.fbHeadline} characters, description max ${AD_LIMITS.fbDescription}, spaces included). Rewrite only the headline and description of each, same meaning, within the limits.\n${bad
      .map(({ a, index }) => `#${index}: headline "${a.headline}" (${(a.headline ?? "").length}), description "${a.description}" (${(a.description ?? "").length})`)
      .join("\n")}\n\nReturn JSON {"fixes":[{"index":number,"headline":string,"description":string}]}.`
    const fixes = await generateJSON<{ fixes?: { index: number; headline: string; description: string }[] }>(
      fixPrompt,
      {
        type: SchemaType.OBJECT,
        properties: {
          fixes: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: { index: { type: SchemaType.INTEGER }, headline: { type: SchemaType.STRING }, description: { type: SchemaType.STRING } },
              required: ["index", "headline", "description"],
            },
          },
        },
        required: ["fixes"],
      },
      { systemInstruction: system, temperature: 0.5 }
    )
    for (const f of Array.isArray(fixes.fixes) ? fixes.fixes : []) {
      if (ads[f?.index] && typeof f.headline === "string" && typeof f.description === "string") ads[f.index] = { ...ads[f.index], headline: f.headline.trim(), description: f.description.trim() }
    }
  }

  const digits = toE164(client.whatsapp).replace("+", "")
  const allowed = FB_CTAS[objective]
  ads = ads.map((a) => ({ ...a }))
  return ads.map((a) => ({
    primaryText: a.primaryText!.trim(),
    headline: a.headline!.trim(),
    description: (a.description ?? "").trim(),
    ctaType: allowed.includes(a.ctaType ?? "") ? a.ctaType! : allowed[0],
    // built in code, never by the model, so the number is always the client's
    whatsappLink: `https://wa.me/${digits}?text=${encodeURIComponent((a.whatsappMessage ?? "").trim() || DEFAULT_WA_MESSAGE[client.category][lang](emirate))}`,
  }))
}

/** Ad variations for one emirate: primaryText, headline, description, ctaType and a wa.me deep link. */
export async function generateFacebookAd(
  client: ClientDetail,
  objective: FbObjective,
  offer: string,
  audience: string,
  language: Language,
  count: number,
  emirate: string = client.emirate
) {
  const out: Localized<FbAd[]> = {}
  await Promise.all(
    languagesFor(language).map(async (lang) => {
      out[lang] = await fbAdsFor(client, lang, emirate, objective, offer, audience, count)
    })
  )
  return out
}

/** Facebook ads for every selected emirate. */
export async function generateFacebookAds(client: ClientDetail, language: Language, req: FacebookRequest) {
  const run = limiter(3)
  const result: Localized<FacebookResult> = {}
  await Promise.all(
    languagesFor(language).map(async (lang) => {
      const groups = await Promise.all(
        req.emirates.map(async (emirate) => ({
          emirate,
          ads: await run(() => fbAdsFor(client, lang, emirate, req.objective, req.offer, req.audience, req.count)),
        }))
      )
      result[lang] = { groups }
    })
  )
  return result
}
