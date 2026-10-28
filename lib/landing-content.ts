/**
 * Helpers for the body of a landing page, which is one markdown document: an intro, then an H2 section for each part of the page
 * (benefits, service, process, reviews, FAQ...). The title, H1 and other meta tags are kept apart. Pure: safe to import from client components.
 *
 * Conventions the writer follows, so the page can be checked and rendered:
 * - `## ` starts a section and `### ` a sub-heading (each FAQ question is an H3 under the FAQ section).
 * - The process is an ordered list, each item starting with the step title in bold.
 * - Buttons are links to `#call` and `#whatsapp`, which the HTML export points at the client's numbers.
 * - A customer quote is a blockquote.
 */

export const CALL_LINK = "#call"
export const WHATSAPP_LINK = "#whatsapp"

const PROCESS_HEADING = /process|steps?\b|how (it|we)|what to expect|from .* to |خطوات|كيف (نعمل|تعمل|يتم)|مراحل|آلية|طريقة (العمل|عملنا)/i
const FAQ_HEADING = /faq|frequently asked|common questions|questions|الأسئلة|أسئلة/i

/** Markdown as the model wrote it, tidied: Unix line breaks, no H1 (the H1 is in the meta tags), no run of blank lines. */
export function cleanContent(md: string) {
  return md
    .replace(/\r\n/g, "\n")
    .replace(/^\s*```(?:markdown|md)?\s*\n/i, "")
    .replace(/\n```\s*$/, "")
    .split("\n")
    .filter((line) => !/^#\s+\S/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** The text a visitor reads: markdown syntax removed, one block per line. */
export function plainText(md: string) {
  return md
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*(?:[-*_]\s*){3,}$/, "")
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*>\s?/, "")
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1")
        .replace(/(\*\*|__)(.*?)\1/g, "$2")
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1$2")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/\|/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("\n")
}

const splitWords = (s: string) => s.split(/\s+/).filter(Boolean)

/** Words of visible copy in a markdown string. */
export const contentWords = (md: string) => splitWords(plainText(md)).length

/* ---------------------------------------------------------------- structure */

export type ContentSub = { heading: string; text: string }
export type ContentSection = {
  heading: string
  /** the markdown under the heading, up to the next H2 (sub-headings included) */
  text: string
  /** words of visible copy in the section, heading included */
  words: number
  subs: ContentSub[]
}

const HEADING = /^(#{2,3})\s+(.+?)\s*#*\s*$/

/** The intro (everything before the first H2) and the H2 sections in page order. */
export function parseContent(md: string): { intro: string; sections: ContentSection[] } {
  const intro: string[] = []
  const sections: { heading: string; lines: string[]; subs: { heading: string; lines: string[] }[] }[] = []
  let inFence = false
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence
    const h = inFence ? null : HEADING.exec(line)
    if (h && h[1] === "##") {
      sections.push({ heading: h[2].trim(), lines: [], subs: [] })
    } else if (h) {
      const current = sections.at(-1)
      if (current) {
        current.subs.push({ heading: h[2].trim(), lines: [] })
        current.lines.push(line)
      } else intro.push(line)
    } else {
      const current = sections.at(-1)
      if (!current) intro.push(line)
      else {
        current.lines.push(line)
        current.subs.at(-1)?.lines.push(line)
      }
    }
  }
  return {
    intro: intro.join("\n").trim(),
    sections: sections.map((s) => {
      const text = s.lines.join("\n").trim()
      return { heading: s.heading, text, words: contentWords(`${s.heading}\n${text}`), subs: s.subs.map((x) => ({ heading: x.heading, text: x.lines.join("\n").trim() })) }
    }),
  }
}

export const h2Headings = (md: string) => parseContent(md).sections.map((s) => s.heading)

/** Every H2 and H3 heading, for finding the primary keyword or a secondary one in a heading. */
export function allHeadings(md: string) {
  return md
    .split("\n")
    .map((l) => HEADING.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[2].trim())
}

/** The FAQ as question and answer pairs: the H3s under the FAQ section. */
export function faqItems(md: string): { question: string; answer: string }[] {
  const { sections } = parseContent(md)
  const faq = sections.find((s) => FAQ_HEADING.test(s.heading) && s.subs.length > 0)
  const subs = faq ? faq.subs : sections.flatMap((s) => s.subs).filter((x) => /[?؟]\s*$/.test(x.heading))
  return subs.map((x) => ({ question: x.heading, answer: plainText(x.text.split("\n").filter((l) => !HEADING.test(l)).join("\n")).replace(/\n+/g, " ") })).filter((x) => x.answer)
}

const ITEM = /^\s*\d+[.)]\s+(.*)$/

/** The ordered-list items of a block of markdown, each with its bold title and the text after it. */
function orderedItems(md: string): { title: string; description: string }[] {
  const items: string[] = []
  for (const line of md.split("\n")) {
    const m = ITEM.exec(line)
    if (m) items.push(m[1])
    else if (items.length && line.trim() && !HEADING.test(line) && /^\s+/.test(line)) items[items.length - 1] += ` ${line.trim()}`
  }
  return items.map((item) => {
    const bold = /^(?:\*\*|__)(.+?)(?:\*\*|__)[\s.:–—-]*(.*)$/.exec(item)
    return bold ? { title: bold[1].replace(/[.:]$/, "").trim(), description: plainText(bold[2]).replace(/\n+/g, " ") } : { title: "", description: plainText(item).replace(/\n+/g, " ") }
  })
}

/** The process steps: the ordered list in the process section, or failing that the longest ordered list on the page. */
export function processSteps(md: string) {
  const { sections } = parseContent(md)
  const section = sections.find((s) => PROCESS_HEADING.test(s.heading) && orderedItems(s.text).length > 0)
  if (section) return orderedItems(section.text)
  return sections.map((s) => orderedItems(s.text)).reduce((best, items) => (items.length > best.length ? items : best), [])
}

export const hasProcessSection = (md: string) => parseContent(md).sections.some((s) => PROCESS_HEADING.test(s.heading))
export const processSection = (md: string) => parseContent(md).sections.find((s) => PROCESS_HEADING.test(s.heading))
export const isFaqHeading = (heading: string) => FAQ_HEADING.test(heading)

/** Lines of the copy that carry a call or WhatsApp button (a line may hold both): the calls to action a visitor sees. */
export const ctaLines = (md: string) => md.split("\n").filter((l) => /\[[^\]]+\]\((#call|#whatsapp)\)/.test(l)).length

/** The words before the first call or WhatsApp button, to check the first screen has a way to get in touch. */
export function wordsBeforeFirstCta(md: string) {
  const at = md.search(/\[[^\]]+\]\((#call|#whatsapp)\)/)
  return at < 0 ? null : contentWords(md.slice(0, at))
}

/**
 * Sentences that appear more than once, or nearly (80% of their words in common). Call and WhatsApp buttons and headings are left out.
 * Padding a page with its own sentences is how a model reaches a word count, and a visitor notices.
 */
export function repeatedSentences(md: string, minWords = 8): string[] {
  const copy = md
    .split("\n")
    .filter((l) => !HEADING.test(l))
    .join("\n")
    .replace(/\[[^\]]+\]\((?:#call|#whatsapp)\)/g, " ")
  const sentences = plainText(copy)
    .split(/\n|(?<=[.!?؟])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ s, set: new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) }))
    .filter((x) => x.set.size >= minWords)
  const repeated = new Set<string>()
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      let shared = 0
      for (const w of sentences[i].set) if (sentences[j].set.has(w)) shared++
      if (shared / (sentences[i].set.size + sentences[j].set.size - shared) >= 0.8) repeated.add(sentences[j].s)
    }
  }
  return [...repeated]
}

/** The copy that reading ease is measured on: paragraphs and list items, not headings, each ended with a full stop. */
export function readableText(md: string) {
  return md
    .split("\n")
    .filter((l) => !HEADING.test(l))
    .map((l) => plainText(l).trim())
    .filter(Boolean)
    .map((t) => (/[.!?؟]$/.test(t) ? t : `${t}.`))
    .join(" ")
}

const QUOTE_PLACEHOLDER = ["> [PLACEHOLDER: add a real customer testimonial]", ">", "> [PLACEHOLDER: add customer name and job]"]

/**
 * A customer quote is the customer's own words, so it may only be one that the company profile contains word for word. Any other
 * quote the model made up is replaced with the placeholder pair, whatever the prompt said.
 */
export function stripInventedQuotes(md: string, profile: string): string {
  const flat = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  const source = flat(profile)
  const lines = md.replace(/\r\n/g, "\n").split("\n")
  const out: string[] = []
  for (let i = 0; i < lines.length; ) {
    if (!/^\s*>/.test(lines[i])) {
      out.push(lines[i++])
      continue
    }
    let end = i
    while (end < lines.length && /^\s*>/.test(lines[end])) end++
    const block = lines.slice(i, end).map((l) => l.replace(/^\s*>\s?/, ""))
    const blank = block.findIndex((l) => !l.trim())
    const quote = flat((blank < 0 ? block : block.slice(0, blank)).join(" ").replace(/\[PLACEHOLDER:[^\]]*\]/g, " "))
    out.push(...(quote === "" || source.includes(quote) ? lines.slice(i, end) : QUOTE_PLACEHOLDER))
    i = end
  }
  return out.join("\n")
}

/** Replace the body of one H2 section (everything under its heading, up to the next H2), keeping the heading. Unchanged when the heading is not found. */
export function replaceSectionBody(md: string, heading: string, body: string) {
  const lines = md.replace(/\r\n/g, "\n").split("\n")
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
  const start = lines.findIndex((l) => {
    const h = HEADING.exec(l)
    return h !== null && h[1] === "##" && key(h[2]) === key(heading)
  })
  if (start < 0) return md
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l))
  if (end < 0) end = lines.length
  return [...lines.slice(0, start + 1), "", body.trim(), "", ...lines.slice(end)].join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

const CTA_LINK = /\[[^\]]+\]\((?:#call|#whatsapp)\)/

/**
 * Last resort for a page with a button after every paragraph: keep the first button paragraph of the intro and the last one of
 * every section, and drop the sentences that carry buttons from the paragraphs before it. Lists, quotes and headings are untouched.
 */
export function limitCtas(md: string): string {
  const chunks = md.replace(/\r\n/g, "\n").split(/(?=^##\s)/m)
  return chunks
    .map((chunk, index) => {
      const blocks = chunk.split(/\n{2,}/)
      const plain = (b: string) => !/^\s*(#|>|[-*+]\s|\d+[.)]\s)/.test(b) && CTA_LINK.test(b)
      const idx = blocks.map((b, i) => (plain(b) ? i : -1)).filter((i) => i >= 0)
      if (idx.length < 2) return chunk
      const keep = index === 0 ? idx[0] : idx[idx.length - 1]
      return blocks
        .map((b, i) => {
          if (i === keep || !idx.includes(i)) return b
          const kept = b.split(/(?<=[.!?؟])\s+/).filter((s) => !CTA_LINK.test(s))
          return kept.join(" ")
        })
        .filter((b) => b.trim())
        .join("\n\n")
    })
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
}

/** How many lines with call or WhatsApp buttons each part of the page has: the intro, then each H2 section. */
export function ctaCounts(md: string) {
  const { intro, sections } = parseContent(md)
  return [{ heading: "the intro", count: ctaLines(intro) }, ...sections.map((s) => ({ heading: s.heading, count: ctaLines(s.text) }))]
}

/**
 * The longest sentences of the running copy, for rewriting in short ones. Only sentences found word for word in the markdown are
 * returned (not those with bold text or links inside), so a rewrite can be swapped in with a plain replace.
 */
export function longSentences(md: string, minWords = 17, limit = 40): string[] {
  const seen = new Set<string>()
  return md
    .split("\n")
    .filter((l) => !HEADING.test(l) && !/^\s*>/.test(l))
    .flatMap((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= minWords && !/[*\[\]`|]/.test(s) && md.includes(s) && !seen.has(s) && seen.add(s))
    .sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length)
    .slice(0, limit)
}

/* ---------------------------------------------------------------- rendering */

export type ContentBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "p"; text: string }

const BULLET = /^\s*[-*+]\s+(.*)$/
const STARTS_BLOCK = (line: string) => HEADING.test(line) || ITEM.test(line) || BULLET.test(line) || /^\s*>/.test(line)

/** The markdown as blocks a renderer can map over: headings, lists, quotes and paragraphs. Only the syntax the writer is told to use. */
export function parseBlocks(md: string): ContentBlock[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n")
  const blocks: ContentBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim() || /^\s*(?:[-*_]\s*){3,}$/.test(line)) {
      i++
      continue
    }
    const h = HEADING.exec(line)
    if (h) {
      blocks.push({ type: "heading", level: h[1].length === 2 ? 2 : 3, text: h[2] })
      i++
    } else if (/^\s*>/.test(line)) {
      const quote: string[] = [""]
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        const part = lines[i].replace(/^\s*>\s?/, "").trim()
        if (part) quote[quote.length - 1] = `${quote.at(-1)} ${part}`.trim()
        else quote.push("")
        i++
      }
      blocks.push({ type: "quote", lines: quote.filter(Boolean) })
    } else if (ITEM.test(line) || BULLET.test(line)) {
      const ordered = ITEM.test(line)
      const items: string[] = []
      while (i < lines.length) {
        const m = (ordered ? ITEM : BULLET).exec(lines[i])
        if (m) items.push(m[1].trim())
        else if (items.length && lines[i].trim() && /^\s+/.test(lines[i]) && !STARTS_BLOCK(lines[i])) items[items.length - 1] += ` ${lines[i].trim()}`
        else break
        i++
      }
      blocks.push({ type: "list", ordered, items })
    } else {
      const para: string[] = []
      while (i < lines.length && lines[i].trim() && !STARTS_BLOCK(lines[i])) para.push(lines[i++].trim())
      blocks.push({ type: "p", text: para.join(" ") })
    }
  }
  return blocks
}

export type InlineToken = { kind: "text" | "bold" | "italic" | "link"; text: string; href?: string }

/** Bold, italic and links inside a line of text. */
export function parseInline(text: string): InlineToken[] {
  const out: InlineToken[] = []
  const pattern = /\*\*([^*]+)\*\*|(?<![*\w])\*([^*\s][^*]*)\*(?!\w)|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ kind: "bold", text: m[1] })
    else if (m[2] !== undefined) out.push({ kind: "italic", text: m[2] })
    else out.push({ kind: "link", text: m[3], href: m[4] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) })
  return out
}

/* ------------------------------------------------------------------- legacy */

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const objs = (v: unknown) => list(v).filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
const strs = (v: unknown) => list(v).map(text).filter(Boolean)

/**
 * Pages saved before the body became one document had a field for each part (hero, benefits, service details, process...).
 * Turn them into the markdown a new page has, so they open, check and export the same way.
 */
export function legacyToContent(raw: Record<string, unknown>) {
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
  const hero = obj(raw.hero)
  const headings = obj(raw.headings)
  const proof = obj(raw.socialProof)
  const cta = obj(raw.cta)
  const extras = (slot: string) =>
    objs(raw.additionalSections)
      .filter((e) => (slot === "process" ? e.placement !== "service" && e.placement !== "proof" : e.placement === slot))
      .map((e) => [`## ${text(e.heading)}`, ...strs(e.paragraphs)].join("\n\n"))

  const parts: string[] = []
  const intro = [text(hero.headline) && `**${text(hero.headline)}**`, text(hero.subheadline), text(hero.cta) && `[${text(hero.cta)}](${CALL_LINK})`, strs(hero.trustBadges).length ? strs(hero.trustBadges).map((b) => `- ${b}`).join("\n") : ""].filter(Boolean)
  if (intro.length) parts.push(intro.join("\n\n"))
  const benefits = objs(raw.benefits)
  if (benefits.length) parts.push([`## ${text(headings.benefits)}`, ...benefits.map((b) => `### ${text(b.heading)}\n\n${text(b.description)}`)].join("\n\n"))
  const service = strs(raw.serviceDetails)
  if (service.length) parts.push([`## ${text(headings.service)}`, ...service].join("\n\n"))
  parts.push(...extras("service"))
  const steps = objs(raw.process)
  if (steps.length) parts.push([`## ${text(headings.process)}`, steps.map((s, i) => `${i + 1}. **${text(s.title)}** ${text(s.description)}`).join("\n")].join("\n\n"))
  parts.push(...extras("process"))
  const stats = objs(proof.stats)
  const quotes = objs(proof.testimonials)
  if (stats.length || quotes.length)
    parts.push([`## ${text(headings.socialProof)}`, stats.map((s) => `- **${text(s.value)}** ${text(s.label)}`).join("\n"), ...quotes.map((t) => `> ${text(t.quote)}\n>\n> ${[text(t.name), text(t.detail)].filter(Boolean).join(", ")}`)].filter(Boolean).join("\n\n"))
  parts.push(...extras("proof"))
  const faq = objs(raw.faq)
  if (faq.length) parts.push([`## ${text(headings.faq)}`, ...faq.map((f) => `### ${text(f.question)}\n\n${text(f.answer)}`)].join("\n\n"))
  if (text(cta.headline) || text(cta.description))
    parts.push([`## ${text(cta.headline)}`, text(cta.description), [text(cta.phoneButton) && `[${text(cta.phoneButton)}](${CALL_LINK})`, text(cta.whatsappButton) && `[${text(cta.whatsappButton)}](${WHATSAPP_LINK})`].filter(Boolean).join(" ")].filter(Boolean).join("\n\n"))
  return parts.join("\n\n")
}
