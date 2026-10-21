/** Types, validation, rendering and CSV export for Facebook ads, shared by the generator, API routes and Ads UI. No server imports. */

import { BadRequestError, type Localized } from "@/lib/content-types"

export const AD_LIMITS = {
  fbHeadline: 40,
  fbDescription: 30,
} as const

export const FB_COUNT = { min: 3, max: 10, default: 5 }

export type AdsType = "fb-ad"

export const FB_OBJECTIVES = [
  { id: "traffic", label: "Traffic" },
  { id: "messages", label: "Messages" },
  { id: "conversions", label: "Conversions" },
] as const
export type FbObjective = (typeof FB_OBJECTIVES)[number]["id"]

export const FB_CTA_LABELS: Record<string, string> = {
  LEARN_MORE: "Learn More",
  GET_QUOTE: "Get Quote",
  CONTACT_US: "Contact Us",
  WHATSAPP_MESSAGE: "WhatsApp",
  SEND_MESSAGE: "Send Message",
  BOOK_NOW: "Book Now",
}
export const FB_CTAS: Record<FbObjective, string[]> = {
  traffic: ["LEARN_MORE", "GET_QUOTE", "CONTACT_US"],
  messages: ["WHATSAPP_MESSAGE", "SEND_MESSAGE"],
  conversions: ["GET_QUOTE", "CONTACT_US", "BOOK_NOW"],
}

export type FbAd = { primaryText: string; headline: string; description: string; ctaType: string; whatsappLink: string }
export type FacebookResult = { groups: { emirate: string; ads: FbAd[] }[] }
export type FacebookRequest = { emirates: string[]; objective: FbObjective; offer: string; audience: string; count: number }

export type AdsResultMap = { "fb-ad": Localized<FacebookResult> }

/* ---------------------------------------------------------- validation */

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")

export function parseFacebookRequest(raw: unknown, allowedEmirates: string[]): FacebookRequest {
  const o = isObject(raw) ? raw : {}
  const objective = FB_OBJECTIVES.find((x) => x.id === o.objective)?.id
  if (!objective) throw new BadRequestError("Choose a campaign objective.")

  let emirates = allowedEmirates
  if (o.batch !== true) {
    const emirate = str(o.emirate)
    if (!allowedEmirates.includes(emirate)) throw new BadRequestError("Select an emirate this client serves.")
    emirates = [emirate]
  }

  const count = Math.min(FB_COUNT.max, Math.max(FB_COUNT.min, Math.round(Number(o.count) || FB_COUNT.default)))
  return { emirates, objective, offer: str(o.offer).slice(0, 300), audience: str(o.audience).slice(0, 300), count }
}

function normalizeFacebookOne(raw: unknown): FacebookResult | null {
  if (!isObject(raw) || !Array.isArray(raw.groups)) return null
  const groups: FacebookResult["groups"] = []
  for (const g of raw.groups) {
    if (!isObject(g) || !Array.isArray(g.ads)) return null
    const ads: FbAd[] = []
    for (const a of g.ads) {
      if (!isObject(a) || typeof a.primaryText !== "string" || typeof a.headline !== "string" || typeof a.description !== "string") return null
      const link = str(a.whatsappLink)
      ads.push({
        primaryText: a.primaryText,
        headline: a.headline,
        description: a.description,
        ctaType: str(a.ctaType) in FB_CTA_LABELS ? str(a.ctaType) : "LEARN_MORE",
        whatsappLink: link.startsWith("https://wa.me/") ? link : "",
      })
    }
    groups.push({ emirate: str(g.emirate), ads })
  }
  return { groups }
}

/** Validate a (possibly user-edited) result; null when the shape is wrong. */
export function normalizeAdsResult(raw: unknown): AdsResultMap["fb-ad"] | null {
  if (!isObject(raw)) return null
  const out: AdsResultMap["fb-ad"] = {}
  for (const lang of ["en", "ar"] as const) {
    if (raw[lang] === undefined || raw[lang] === null) continue
    const value = normalizeFacebookOne(raw[lang])
    if (!value) return null
    out[lang] = value
  }
  return out.en === undefined && out.ar === undefined ? null : out
}

/* -------------------------------------------------------------- render */

export function renderFacebookText(result: FacebookResult) {
  return result.groups
    .map((g) =>
      [
        `## ${g.emirate}`,
        ...g.ads.map((a, i) => `**Ad ${i + 1}: ${a.headline}**\n${a.primaryText}\n\n${a.description} · ${FB_CTA_LABELS[a.ctaType] ?? a.ctaType}\n${a.whatsappLink}`),
      ].join("\n\n")
    )
    .join("\n\n")
}

/** Map a result to the columns of GeneratedContent. English goes in `content` unless Arabic is all there is. */
export function adsColumns(result: AdsResultMap["fb-ad"]) {
  const en = result.en ? renderFacebookText(result.en) : null
  const ar = result.ar ? renderFacebookText(result.ar) : null
  return { content: en ?? ar ?? "", contentAr: en !== null ? ar : null }
}

/* ----------------------------------------------------------------- CSV */

const META_COLUMNS = [
  "Campaign Name",
  "Campaign Objective",
  "Ad Set Name",
  "Ad Name",
  "Ad Status",
  "Title",
  "Body",
  "Link Description",
  "Call to Action",
  "Link",
  "Display Link",
]

const META_OBJECTIVE: Record<FbObjective, string> = { traffic: "Traffic", messages: "Engagement", conversions: "Leads" }

const cell = (v: string | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`

/** Meta Ads Manager import CSV: one row per ad, Paused. Messages ads link to the WhatsApp deep link. */
export function metaCsv(brand: string, website: string | null, objective: FbObjective, result: Localized<FacebookResult>) {
  const rows: Record<string, string>[] = []
  const langs = (["en", "ar"] as const).filter((l) => result[l])
  const both = langs.length > 1
  const display = (website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "")

  for (const lang of langs) {
    for (const group of result[lang]!.groups) {
      const campaign = `${brand} | ${META_OBJECTIVE[objective]} | ${group.emirate}${both ? ` (${lang.toUpperCase()})` : ""}`
      group.ads.forEach((ad, i) => {
        const wa = ad.ctaType === "WHATSAPP_MESSAGE" || objective === "messages"
        rows.push({
          "Campaign Name": campaign,
          "Campaign Objective": META_OBJECTIVE[objective],
          "Ad Set Name": `${group.emirate} | Broad`,
          "Ad Name": `${group.emirate} | Ad ${i + 1}`,
          "Ad Status": "PAUSED",
          Title: ad.headline,
          Body: ad.primaryText,
          "Link Description": ad.description,
          "Call to Action": ad.ctaType,
          Link: wa && ad.whatsappLink ? ad.whatsappLink : (website ?? ad.whatsappLink),
          "Display Link": display,
        })
      })
    }
  }
  return "﻿" + [META_COLUMNS, ...rows.map((r) => META_COLUMNS.map((c) => r[c]))].map((r) => r.map(cell).join(",")).join("\r\n")
}
