/**
 * Editable system prompts. Each generator's system prompt is a template with {{variables}}; the defaults live here,
 * are copied into the PromptTemplate table, and can be edited in Settings. Pure (no server imports) so the Settings UI can use it.
 *
 * Syntax:  {{name}} is replaced by the variable's value.
 *          {{#name}}...{{/name}} is kept only when the variable is not empty (it can use {{name}} inside).
 */

import type { ClientCategory } from "@/lib/constants"
import { FB_EXAMPLES_AR, FB_EXAMPLES_EN } from "@/lib/prompts/fb-examples"
import { GBP_EXAMPLES_AR, GBP_EXAMPLES_EN } from "@/lib/prompts/gbp-examples"
import { HUMANIZER_RULES, SCORER_SYSTEM_PROMPT } from "@/lib/prompts/humanizer"
import { PROPOSAL_SYSTEM_PROMPT } from "@/lib/prompts/proposal"
import { REPORT_SYSTEM_PROMPT } from "@/lib/prompts/report"

export type TemplateName = "gbp-description" | "faq-generation" | "blog-post" | "meta-tags" | "fb-ad" | "gbp-posts" | "humanizer" | "humanizer-scorer" | "report" | "proposal"

export type TemplateVariable = { name: string; description: string }

export type TemplateDef = {
  name: TemplateName
  label: string
  description: string
  variables: TemplateVariable[]
  systemPrompt: string
  /** few-shot examples: an array of strings, or { en: string[], ar: string[] } */
  examples: unknown
}

const CATEGORY_CONTEXT: TemplateVariable = {
  name: "category_context",
  description: "Business-category instructions for non-moving clients (used furniture, pickup rental). Empty for moving companies. Added to the top of the prompt automatically when you do not place it yourself",
}

const CLIENT: TemplateVariable[] = [
  { name: "client_name", description: "Company name in English" },
  { name: "client_name_ar", description: "Company name in Arabic" },
  { name: "emirate", description: "The client's primary emirate" },
  { name: "tone", description: "Tone words chosen for the client, e.g. professional, trustworthy" },
  { name: "client_brief", description: "A block of facts about the client: services, areas, website, fleet, uniform, notes" },
  CATEGORY_CONTEXT,
]
const LANGUAGE: TemplateVariable = { name: "language_rule", description: "Instruction for the output language (English or Arabic)" }
const GUARD: TemplateVariable = { name: "no_inventing", description: "The rule against inventing facts, prices or awards" }
const EXAMPLES: TemplateVariable = { name: "examples", description: "The few-shot examples below, formatted as a list. Empty when there are none" }

const SCHEMA_NOTE = "Return only the description text."

/* -------------------------------------------------------- business category */

type CategoryProfile = {
  business: string
  services: string
  angles: string
  facts: string
  images: string
  tip: string
  fallbackServices: string
}

const CATEGORY_PROFILES: Record<Exclude<ClientCategory, "moving">, CategoryProfile> = {
  used_furniture: {
    business: "a used furniture dealer in the UAE (buying, selling and restoring pre-owned furniture)",
    services:
      "Services are about buying used furniture, selling it, restoration, delivery, home staging, office furniture clearance, pickup and inspection or appraisal. Describe them in those terms: what the shop buys, what condition the pieces are in, how a seller gets paid, how a buyer gets the piece home.",
    angles:
      "Lead with affordability (good furniture at a fraction of the new price), quality (inspected, restored, honest condition), and variety (a changing stock of sofas, beds, dining sets, wardrobes and office furniture). Reliability and speed of a move are not the point here.",
    facts:
      "Customers are two kinds of people: sellers who want to clear furniture quickly for a fair price (people leaving the UAE, upgrading, closing an office) and buyers furnishing a home or office on a budget.",
    images:
      "Showrooms and furniture displays: arranged sofas, dining sets, bedroom sets and wardrobes, a restored piece being finished by a craftsperson, a staged living room, price-tagged items in a warehouse showroom. Do not show moving trucks or loading scenes unless the post is specifically about delivery.",
    tip: "A useful tip for buying or selling used furniture in the UAE (checking condition, solid wood vs veneer, pricing, preparing a piece for sale, getting it home).",
    fallbackServices: "buying and selling used furniture",
  },
  pickup_rental: {
    business: "a pickup truck rental company in the UAE (1 to 3 ton pickups rented daily, weekly or monthly, self-drive or with a driver)",
    services:
      "Services are about renting pickups: 1-ton, 2-ton and 3-ton vehicles, self-drive or with a driver, on daily, weekly or monthly terms, plus event logistics and small-business delivery. Describe them in those terms: which load suits which size, how long the rental runs, what is included.",
    angles:
      "Lead with fleet availability (the right size ready when needed), pricing (clear daily, weekly and monthly rates, never invented figures), flexibility (self-drive or driver, short or long term) and coverage area (which emirates and areas are served).",
    facts:
      "Customers are small businesses, shop owners, contractors, event organisers and individuals who need a vehicle for a load without buying one.",
    images:
      "Truck fleets and delivery vans: a row of clean pickups parked at a depot, a pickup loaded with boxes or goods on a UAE road, a delivery van at a shop, a driver handing over keys. Do not show household moving crews or furniture showrooms.",
    tip: "A useful tip for renting a pickup in the UAE (choosing 1, 2 or 3 ton, documents needed, self-drive vs driver, how rental periods work, loading and securing cargo).",
    fallbackServices: "pickup truck rental",
  },
}

/**
 * Extra system-prompt section for a client's business category. Empty for "moving", so moving prompts stay exactly as
 * they are. For the other categories it says what the business is and how the ad angles and imagery change, and tells
 * the model to read the moving-company wording in the prompt below it as that business.
 */
export function getCategoryContext(category: string | null | undefined) {
  if (!category || category === "moving" || !(category in CATEGORY_PROFILES)) return ""
  const p = CATEGORY_PROFILES[category as keyof typeof CATEGORY_PROFILES]
  return `BUSINESS CATEGORY (this overrides any wording below that assumes a moving company): the client is ${p.business}, not a moving company. Wherever the instructions below say "moving company", "movers", "moves" or "relocation", read them as this business instead.

${p.services}

${p.facts}

Angles and benefits: ${p.angles}

Image prompts must show: ${p.images}`
}

/** What a post or image prompt should depict for this category, as one sentence. Empty for moving. */
export function getCategoryImageGuide(category: string | null | undefined) {
  if (!category || !(category in CATEGORY_PROFILES)) return ""
  return CATEGORY_PROFILES[category as keyof typeof CATEGORY_PROFILES].images
}

export function getCategoryTip(category: string | null | undefined) {
  if (!category || !(category in CATEGORY_PROFILES)) return ""
  return CATEGORY_PROFILES[category as keyof typeof CATEGORY_PROFILES].tip
}

/** The service list to fall back on when a client has none. */
export function getCategoryFallbackServices(category: string | null | undefined) {
  if (!category || !(category in CATEGORY_PROFILES)) return "residential and commercial moving"
  return CATEGORY_PROFILES[category as keyof typeof CATEGORY_PROFILES].fallbackServices
}

export const TEMPLATE_DEFS: TemplateDef[] = [
  {
    name: "gbp-description",
    label: "GBP Description",
    description: "Google Business Profile description, written once per language.",
    variables: [
      ...CLIENT.filter((v) => v.name !== "client_brief"),
      { name: "services", description: "The client's services, comma separated" },
      { name: "areas", description: "The client's areas, comma separated" },
      { name: "max_chars", description: "Character limit for the description" },
      { name: "highlights", description: "Selling points picked in the form, separated by semicolons. Empty when none" },
      LANGUAGE,
      GUARD,
      EXAMPLES,
    ],
    systemPrompt: `You are an SEO copywriter for UAE moving companies. Generate a Google Business Profile description for {{client_name}} ({{client_name_ar}}) in {{emirate}}. Include these services: {{services}}. Areas served: {{areas}}. Keep it under {{max_chars}} characters. Tone: {{tone}}. Include a WhatsApp CTA.

{{language_rule}}

{{#highlights}}Work these selling points in naturally: {{highlights}}.{{/highlights}}

Rules: plain text only (no markdown, emoji, bullet characters or hashtags). No URLs and no phone numbers, since Google rejects them in descriptions; make the WhatsApp CTA a sentence such as inviting the reader to message the company on WhatsApp. Lead with the company name and its main service and city. Mention the main areas naturally rather than listing every one. Do not stuff keywords.

{{no_inventing}}

{{#examples}}Below are descriptions written by the agency. Match their voice, specificity and rhythm. Do not copy their sentences, and do not reuse their facts (years in business, locations, company names):

{{examples}}{{/examples}}

${SCHEMA_NOTE}`,
    examples: { en: GBP_EXAMPLES_EN, ar: GBP_EXAMPLES_AR },
  },
  {
    name: "faq-generation",
    label: "FAQ Generator",
    description: "FAQ questions and answers written for FAQ schema.",
    variables: [...CLIENT, LANGUAGE, GUARD, EXAMPLES],
    systemPrompt: `You are an SEO copywriter for UAE moving companies. Write FAQ content for {{client_name}} ({{client_name_ar}}), a moving company in {{emirate}}.

{{language_rule}}

Client details:
{{client_brief}}

Questions must be ones real UAE customers ask or search for (pricing factors, packing, building and community rules, permits, Ejari/tenancy timing, booking lead time, insurance and damage, storage, moving between emirates, same-day moves). Answers: 35-70 words, direct, specific, in plain text with no markdown, written so they work as FAQ schema answers. Work the company name and local area into some answers naturally, not all.

Tone: {{tone}}.

{{no_inventing}} If a price depends on the job, say what it depends on rather than quoting a number.

{{#examples}}Example FAQ items from the agency (match their style, do not reuse their facts):

{{examples}}{{/examples}}`,
    examples: [],
  },
  {
    name: "blog-post",
    label: "Blog Post",
    description: "SEO blog post with a title, meta description and markdown body.",
    variables: [...CLIENT, LANGUAGE, GUARD, EXAMPLES],
    systemPrompt: `You are an SEO blog writer for UAE moving companies, writing for {{client_name}} ({{client_name_ar}}) in {{emirate}}.

{{language_rule}}

Client details:
{{client_brief}}

Tone: {{tone}}.

Write for a UAE resident planning a move: practical, specific to the UAE (heat, building move-in rules and permits, Ejari, peak moving seasons, community regulations) and free of filler. Structure: a short intro that states the benefit, 4-6 sections with ## headings (### only where needed), short paragraphs, bullet or numbered lists where they help, and a closing section with a soft call to action to message the company on WhatsApp. Do not repeat the title as an H1 inside the body. Plain markdown only.

{{no_inventing}}

{{#examples}}Example posts from the agency (match their voice, do not reuse their facts):

{{examples}}{{/examples}}`,
    examples: [],
  },
  {
    name: "meta-tags",
    label: "Meta Tags",
    description: "Title tags and meta descriptions for a list of pages.",
    variables: [...CLIENT, LANGUAGE, GUARD, { name: "title_max", description: "Title length limit" }, { name: "description_max", description: "Description length limit" }, EXAMPLES],
    systemPrompt: `You are an SEO copywriter for UAE moving companies. Write title tags and meta descriptions for the website of {{client_name}} ({{client_name_ar}}) in {{emirate}}.

{{language_rule}}

Client details:
{{client_brief}}

Tone: {{tone}}.

Hard limits: title at most {{title_max}} characters including spaces; description at most {{description_max}} characters, ideally 140-155. Put the main keyword (service + city) near the start of the title, add the brand name only if it fits. Descriptions state a concrete benefit and end with a short call to action. Every page needs a distinct title and description.

{{no_inventing}}

{{#examples}}Examples from the agency (match their style, do not reuse their facts):

{{examples}}{{/examples}}`,
    examples: [],
  },
  {
    name: "fb-ad",
    label: "Facebook Ad",
    description: "Facebook and Instagram ad variations for one emirate.",
    variables: [
      { name: "count", description: "How many ad variations to write" },
      ...CLIENT.filter((v) => ["client_name", "client_name_ar", "emirate", "category_context"].includes(v.name)),
      { name: "objective_guide", description: "What the chosen campaign objective means" },
      LANGUAGE,
      { name: "headline_max", description: "Headline length limit" },
      { name: "description_max", description: "Link description length limit" },
      { name: "cta_types", description: "Call-to-action button types allowed for this objective" },
      { name: "whatsapp_local", description: "WhatsApp number as written in UAE ads, e.g. 050 123 4567" },
      { name: "phone_local", description: "Phone number as written in UAE ads" },
      { name: "website", description: "Website without https://. Empty when the client has none" },
      { name: "company_details", description: "Facts about the client, including other emirates served" },
      GUARD,
      EXAMPLES,
    ],
    systemPrompt: `You are a direct-response Facebook and Instagram ads copywriter for UAE moving companies. Write {{count}} distinct ad variations for {{client_name}} ({{client_name_ar}}) aimed at people in {{emirate}}.

Objective: {{objective_guide}}

{{language_rule}}

Each variation needs a different angle (for example speed of quote, full packing, villa moves, price transparency, storage, same-day moves, moving between emirates). For each ad write:
- primaryText: follows the structure of the agency examples below: a hook line, one or two short lines, benefit lines with emoji bullets or arrows, a clear call to action, then contact lines using only these exact details: WhatsApp {{whatsapp_local}}, Phone {{phone_local}}{{#website}}, Website {{website}}{{/website}}. Natural, human, no hype.
- headline: at most {{headline_max}} characters including spaces.
- description: the link description, at most {{description_max}} characters including spaces.
- ctaType: one of {{cta_types}}.
- whatsappMessage: a short pre-filled WhatsApp message in the ad's language, written from the customer's point of view and mentioning {{emirate}}, with no links.

Company details:
{{company_details}}

{{no_inventing}} Never invent discounts or guarantees: only mention an offer if one is provided in the request.

{{#examples}}Agency examples (match their structure, voice and level of detail, but do not reuse their facts such as crew size, customer counts, years in business, guarantees or phone numbers):

{{examples}}{{/examples}}`,
    examples: { en: FB_EXAMPLES_EN, ar: FB_EXAMPLES_AR },
  },
  {
    name: "gbp-posts",
    label: "GBP Posts",
    description: "Scheduled Google Business Profile posts with keywords and an image prompt.",
    variables: [
      ...CLIENT,
      { name: "language_versions", description: "How many versions each post has (Arabic, English or both) and how to write them" },
      { name: "post_max", description: "Character limit per post" },
      { name: "arabic_keyword_note", description: "Extra keyword instruction for Arabic posts. Empty for English-only" },
      { name: "ai_tells", description: "Stock phrases the writer must avoid" },
      { name: "truck_line", description: "The client's truck, for the image prompt" },
      { name: "uniform", description: "Crew uniform. Empty when not set" },
      { name: "brand_colors_line", description: "Brand colors sentence. Empty when not set" },
      GUARD,
      EXAMPLES,
    ],
    systemPrompt: `You are an SEO copywriter for UAE moving companies, writing Google Business Profile posts for {{client_name}} ({{client_name_ar}}) in {{emirate}}. Tone: {{tone}}.

{{language_versions}}

Length: each version under {{post_max}} characters (aim for 450 to 900). Plain text, no markdown, no hashtags, no URLs, and no phone numbers (Google rejects them in posts). Use at most one or two emoji, and only where they feel natural.

SEO: each post is given target keywords. Work every one of them into the text naturally, in the first sentence or two and, where it fits, once more later. Use the keyword as given or a natural inflection of it, never stuff or repeat it awkwardly, and never force a keyword into a sentence where it does not belong. {{arabic_keyword_note}}Return the keywords the post covers in the keywords field, in English.

Write like a person who works in the business, not like marketing software. Vary sentence length. Prefer concrete details (what gets wrapped, what the crew does, what the building requires) over adjectives. Open differently on every post, and do not start with a question every time. Skip stock phrases, and these in particular: {{ai_tells}}. No rhetorical triple lists in every post, no more than one exclamation mark per post, and no closing line that just repeats the opening.

CTA: pick the best of "call", "learn-more" or "book" for the post, and make the last sentence lead naturally into it (for "call", invite them to call; for "book", to book a slot; for "learn-more", to message or visit to find out more). Do not write the number or a link.

Image prompt (English, one paragraph) for an AI image generator that matches the post: a photorealistic UAE scene, natural daylight, 4:3 aspect ratio. {{truck_line}} {{#uniform}}Crew uniform: {{uniform}}.{{/uniform}} {{brand_colors_line}} No readable text, logos or license plates in the image.

Company details:
{{client_brief}}

{{no_inventing}}

{{#examples}}Example posts from the agency (match their voice, do not reuse their facts):

{{examples}}{{/examples}}`,
    examples: [],
  },
  {
    name: "humanizer",
    label: "Humanizer",
    description: "Rules for removing AI-writing patterns. The strictness level adds its own instructions at the end.",
    variables: [{ name: "strictness_rules", description: "Instructions for the chosen strictness (Light, Medium or Strict). Keep this at the end" }, CATEGORY_CONTEXT, EXAMPLES],
    systemPrompt: `${HUMANIZER_RULES}

{{strictness_rules}}

{{#examples}}Examples of the target voice:

{{examples}}{{/examples}}`,
    examples: [],
  },
  {
    name: "humanizer-scorer",
    label: "Humanizer Scorer",
    description: "How the AI-detection score (0-100) is judged.",
    variables: [EXAMPLES],
    systemPrompt: `${SCORER_SYSTEM_PROMPT}

{{#examples}}Calibration examples:

{{examples}}{{/examples}}`,
    examples: [],
  },
  {
    name: "report",
    label: "Monthly Report",
    description: "The narrative monthly performance report.",
    variables: [CATEGORY_CONTEXT, EXAMPLES],
    systemPrompt: REPORT_SYSTEM_PROMPT,
    examples: [],
  },
  {
    name: "proposal",
    label: "Website Proposal",
    description: "The client proposal for a website project. The header, date and terms and conditions are added around it automatically.",
    variables: [{ name: "business_name", description: "Your business name from Settings → General" }, EXAMPLES],
    systemPrompt: PROPOSAL_SYSTEM_PROMPT,
    examples: [],
  },
]

export const TEMPLATE_NAMES = TEMPLATE_DEFS.map((d) => d.name)
export const getDef = (name: string) => TEMPLATE_DEFS.find((d) => d.name === name)

/* --------------------------------------------------------------- rendering */

type Vars = Record<string, string | number | undefined | null>

const SECTION = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g

export function renderTemplate(text: string, vars: Vars) {
  const get = (name: string) => String(vars[name] ?? "")
  // Saved prompts predate {{category_context}}, so for non-moving clients put it first unless the prompt places it itself
  const context = get("category_context").trim()
  if (context && !/\{\{#?category_context\}\}/.test(text)) text = `${context}\n\n${text}`
  return text
    .replace(SECTION, (_, name: string, inner: string) => (get(name).trim() ? inner : ""))
    .replace(/\{\{(\w+)\}\}/g, (_, name: string) => get(name))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Every variable name a template mentions, including section names. */
export function variablesIn(text: string) {
  return [...new Set([...text.matchAll(/\{\{[#/]?(\w+)\}\}/g)].map((m) => m[1]))]
}

/** Problems that would break rendering: unknown variables and unbalanced sections. Empty array when fine. */
export function templateProblems(text: string, def: Pick<TemplateDef, "variables">) {
  const problems: string[] = []
  if (text.trim().length < 20) problems.push("The prompt is empty or far too short.")
  const known = new Set(def.variables.map((v) => v.name))
  const unknown = variablesIn(text).filter((n) => !known.has(n))
  if (unknown.length) problems.push(`Unknown variable${unknown.length > 1 ? "s" : ""}: ${unknown.map((n) => `{{${n}}}`).join(", ")}. Available: ${[...known].map((n) => `{{${n}}}`).join(", ")}.`)
  for (const name of new Set([...text.matchAll(/\{\{#(\w+)\}\}/g)].map((m) => m[1]))) {
    const opens = (text.match(new RegExp(`\\{\\{#${name}\\}\\}`, "g")) ?? []).length
    const closes = (text.match(new RegExp(`\\{\\{/${name}\\}\\}`, "g")) ?? []).length
    if (opens !== closes) problems.push(`The section {{#${name}}} needs a matching {{/${name}}}.`)
  }
  if ([...text.matchAll(/\{\{\/(\w+)\}\}/g)].some((m) => !text.includes(`{{#${m[1]}}}`))) problems.push("A {{/…}} has no matching {{#…}} before it.")
  return problems
}

/* ---------------------------------------------------------------- examples */

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string")

/** Examples must be an array of strings, or an object with en and/or ar arrays of strings. Returns an error message or null. */
export function examplesProblem(value: unknown): string | null {
  if (isStrings(value)) return null
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    const keys = Object.keys(o)
    if (keys.some((k) => k !== "en" && k !== "ar")) return 'Only the keys "en" and "ar" are allowed.'
    if (keys.some((k) => !isStrings(o[k]))) return 'Each of "en" and "ar" must be an array of strings.'
    return null
  }
  return 'Use an array of strings, or an object like {"en": ["…"], "ar": ["…"]}.'
}

/** The examples for one language as the numbered list a prompt includes. */
export function formatExamples(value: unknown, lang: "en" | "ar" = "en") {
  const list = isStrings(value) ? value : value && typeof value === "object" ? ((value as Record<string, unknown>)[lang] ?? (value as Record<string, unknown>).en) : []
  return (isStrings(list) ? list : [])
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e, i) => `Example ${i + 1}:\n${e}`)
    .join("\n\n---\n\n")
}
