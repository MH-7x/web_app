import { CALL_LINK, WHATSAPP_LINK, faqItems, parseBlocks, parseInline } from "@/lib/landing-content"
import { PLACEHOLDER, type LandingPage } from "@/lib/landing-page-types"

/** Everything the page needs that isn't in the generated copy. */
export type LandingHtmlOptions = {
  lang: "en" | "ar"
  /** E.164, e.g. +971501234567 */
  phone: string
  whatsapp: string
  brandColor: string
  clientName: string
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Escape, then make the [PLACEHOLDER: ...] markers stand out so they are not published by accident. */
const copy = (s: string) => esc(s).replace(new RegExp(PLACEHOLDER.source, "g"), (m) => `<mark class="rounded bg-amber-200 px-1 text-amber-950">${m}</mark>`)

const hex = (s: string) => (/^#[0-9a-fA-F]{6}$/.test(s) ? s : "#0f766e")
const digits = (s: string) => s.replace(/\D/g, "")

const BUTTON_LABELS = { en: { call: "Call Now", whatsapp: "WhatsApp Us" }, ar: { call: "اتصل الآن", whatsapp: "تواصل عبر واتساب" } } as const

/** JSON for a <script type="application/ld+json"> block, or null when it isn't valid JSON. */
function jsonLd(value: unknown) {
  try {
    return JSON.stringify(typeof value === "string" ? JSON.parse(value) : value).replace(/</g, "\\u003c")
  } catch {
    return null
  }
}

/** The text of the first link to `href` in the copy, to label the buttons that stay on screen on a phone. */
function labelFor(content: string, href: string) {
  for (const block of parseBlocks(content)) {
    const texts = block.type === "list" ? block.items : block.type === "quote" ? block.lines : [block.text]
    for (const t of texts) {
      const link = parseInline(t).find((tok) => tok.kind === "link" && tok.href === href)
      if (link) return link.text
    }
  }
  return null
}

/** A complete, responsive page using the Tailwind CDN. Text is escaped; the FAQ gets FAQPage markup. */
export function buildLandingHtml(page: LandingPage, { lang, phone, whatsapp, brandColor, clientName }: LandingHtmlOptions) {
  const rtl = lang === "ar"
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "#contact"
  const wa = whatsapp ? `https://wa.me/${digits(whatsapp)}` : "#contact"
  const brand = hex(brandColor)
  const callLabel = labelFor(page.content, CALL_LINK) ?? BUTTON_LABELS[lang].call
  const waLabel = labelFor(page.content, WHATSAPP_LINK) ?? BUTTON_LABELS[lang].whatsapp

  const faq = faqItems(page.content)
  const faqLd = faq.length
    ? jsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
      })
    : null
  const businessLd = page.technicalSeo.schema ? jsonLd(page.technicalSeo.schema) : null

  const button = (href: string, label: string, solid: boolean) =>
    `<a href="${esc(href)}"${href.startsWith("http") ? ' target="_blank" rel="noopener"' : ""} class="mx-1 my-1 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-base font-semibold no-underline shadow-sm transition hover:opacity-90 ${solid ? "text-white" : "border-2 bg-white"}" style="${solid ? "background:var(--brand)" : "border-color:var(--brand);color:var(--brand)"}">${copy(label)}</a>`

  const inline = (text: string) =>
    parseInline(text)
      .map((t) => {
        if (t.kind === "bold") return `<strong>${copy(t.text)}</strong>`
        if (t.kind === "italic") return `<em>${copy(t.text)}</em>`
        if (t.kind === "link") {
          if (t.href === CALL_LINK) return button(tel, t.text, true)
          if (t.href === WHATSAPP_LINK) return button(wa, t.text, false)
          return /^https?:\/\//i.test(t.href ?? "") ? `<a href="${esc(t.href!)}" class="underline" style="color:var(--brand)">${copy(t.text)}</a>` : copy(t.text)
        }
        return copy(t.text)
      })
      .join("")

  const body = parseBlocks(page.content)
    .map((b) => {
      if (b.type === "heading") return b.level === 2 ? `<h2 class="mt-14 text-2xl font-bold sm:text-3xl">${inline(b.text)}</h2>` : `<h3 class="mt-6 text-lg font-semibold">${inline(b.text)}</h3>`
      if (b.type === "list") return `<${b.ordered ? "ol" : "ul"} class="mt-4 space-y-3 ps-6 text-lg leading-relaxed text-slate-700 ${b.ordered ? "list-decimal" : "list-disc"}">${b.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${b.ordered ? "ol" : "ul"}>`
      if (b.type === "quote") return `<blockquote class="mt-4 border-s-4 ps-4 text-lg text-slate-600" style="border-color:var(--brand)">${b.lines.map((l) => `<p>${inline(l)}</p>`).join("")}</blockquote>`
      return `<p class="mt-4 text-lg leading-relaxed text-slate-700">${inline(b.text)}</p>`
    })
    .join("\n    ")

  return `<!doctype html>
<html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.meta.title)}</title>
<meta name="description" content="${esc(page.meta.description)}">
<script src="https://cdn.tailwindcss.com"></script>
${businessLd ? `<script type="application/ld+json">${businessLd}</script>` : ""}
${faqLd ? `<script type="application/ld+json">${faqLd}</script>` : ""}
</head>
<body class="bg-white pb-20 text-slate-800 antialiased sm:pb-0" style="--brand:${brand}">
<!-- Images to add (file name | alt text | size | loading):
${page.imagePlan.images.map((i) => `${i.filename} | ${i.alt} | ${i.size} | ${i.loading}`).map((l) => esc(l).replace(/--/g, "- -")).join("\n")}
Set width and height on every img, loading="lazy" on all but the hero, and use fetchpriority="high" on the hero. -->

<header class="border-b border-slate-200">
  <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
    <span class="font-bold" style="color:var(--brand)">${esc(clientName)}</span>
    <a href="${esc(tel)}" class="text-sm font-semibold sm:text-base">${esc(phone)}</a>
  </div>
</header>

<main id="contact">
  <article class="mx-auto max-w-3xl px-4 py-12 sm:py-16">
    <h1 class="text-3xl font-extrabold tracking-tight sm:text-5xl">${copy(page.meta.h1)}</h1>
    ${body}
  </article>
</main>

<footer class="px-4 py-6 text-center text-sm text-slate-500">&copy; ${new Date().getFullYear()} ${esc(clientName)}</footer>

<div class="fixed inset-x-0 bottom-0 z-10 grid grid-cols-2 gap-px bg-slate-200 sm:hidden">
  <a href="${esc(tel)}" class="bg-white py-3 text-center text-sm font-semibold" style="color:var(--brand)">${copy(callLabel)}</a>
  <a href="${esc(wa)}" target="_blank" rel="noopener" class="py-3 text-center text-sm font-semibold text-white" style="background:var(--brand)">${copy(waLabel)}</a>
</div>
</body>
</html>
`
}
