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

/** JSON for a <script type="application/ld+json"> block, or null when it isn't valid JSON. */
function jsonLd(value: unknown) {
  try {
    return JSON.stringify(typeof value === "string" ? JSON.parse(value) : value).replace(/</g, "\\u003c")
  } catch {
    return null
  }
}

/** A complete, responsive page using the Tailwind CDN. Text is escaped; the FAQ gets FAQPage markup. */
export function buildLandingHtml(page: LandingPage, { lang, phone, whatsapp, brandColor, clientName }: LandingHtmlOptions) {
  const rtl = lang === "ar"
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "#contact"
  const wa = whatsapp ? `https://wa.me/${digits(whatsapp)}` : "#contact"
  const brand = hex(brandColor)

  const faqLd = page.faq.length
    ? jsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: page.faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
      })
    : null
  const businessLd = page.technicalSeo.schema ? jsonLd(page.technicalSeo.schema) : null

  /** The additional sections that sit at one spot on the page. */
  const extras = (slot: "service" | "process" | "proof") =>
    page.additionalSections
      .filter((e) => e.placement === slot)
      .map(
        (e) =>
          `<section class="px-4 py-14"><div class="mx-auto max-w-3xl space-y-4"><h2 class="text-2xl font-bold sm:text-3xl">${copy(e.heading)}</h2>${e.paragraphs.map((p) => `<p class="text-lg leading-relaxed text-slate-700">${copy(p)}</p>`).join("")}</div></section>`
      )
      .join("\n")

  const button = (href: string, label: string, solid: boolean) =>
    `<a href="${esc(href)}"${href.startsWith("http") ? ' target="_blank" rel="noopener"' : ""} class="inline-flex items-center justify-center rounded-lg px-6 py-3 text-base font-semibold shadow-sm transition hover:opacity-90 ${solid ? "text-white" : "border-2 bg-white"}" style="${solid ? "background:var(--brand)" : "border-color:var(--brand);color:var(--brand)"}">${copy(label)}</a>`

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

<main>
<section class="px-4 py-14 text-center sm:py-20" style="background:color-mix(in srgb, var(--brand) 8%, white)">
  <div class="mx-auto max-w-3xl space-y-5">
    <h1 class="text-3xl font-extrabold tracking-tight sm:text-5xl">${copy(page.meta.h1)}</h1>
    <p class="text-xl font-semibold" style="color:var(--brand)">${copy(page.hero.headline)}</p>
    <p class="text-lg text-slate-600">${copy(page.hero.subheadline)}</p>
    <div class="flex flex-wrap justify-center gap-3 pt-2">
      ${button(tel, page.hero.cta, true)}
      ${button(wa, page.cta.whatsappButton, false)}
    </div>
    ${page.hero.trustBadges.length ? `<ul class="flex flex-wrap justify-center gap-2 pt-4">${page.hero.trustBadges.map((b) => `<li class="rounded-full bg-white px-4 py-1.5 text-sm font-medium shadow-sm ring-1 ring-slate-200">${copy(b)}</li>`).join("")}</ul>` : ""}
  </div>
</section>

${
  page.socialProof.stats.length
    ? `<section class="px-4 py-8 text-white" style="background:var(--brand)"><ul class="mx-auto grid max-w-5xl grid-cols-2 gap-6 text-center sm:grid-cols-${Math.min(4, page.socialProof.stats.length)}">${page.socialProof.stats.map((s) => `<li><p class="text-3xl font-extrabold">${copy(s.value)}</p><p class="text-sm opacity-90">${copy(s.label)}</p></li>`).join("")}</ul></section>`
    : ""
}

<section class="px-4 py-14">
  <div class="mx-auto max-w-5xl">
    <h2 class="mb-8 text-center text-2xl font-bold sm:text-3xl">${copy(page.headings.benefits)}</h2>
    <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      ${page.benefits
        .map(
          (b, i) =>
            `<article class="rounded-xl border border-slate-200 p-6"><span class="mb-3 flex size-10 items-center justify-center rounded-full font-bold text-white" style="background:var(--brand)">${i + 1}</span><h3 class="mb-2 text-lg font-semibold">${copy(b.heading)}</h3><p class="text-slate-600">${copy(b.description)}</p></article>`
        )
        .join("\n      ")}
    </div>
  </div>
</section>

<section class="bg-slate-50 px-4 py-14">
  <div class="mx-auto max-w-3xl space-y-4">
    <h2 class="text-2xl font-bold sm:text-3xl">${copy(page.headings.service)}</h2>
    ${page.serviceDetails.map((p) => `<p class="text-lg leading-relaxed text-slate-700">${copy(p)}</p>`).join("\n    ")}
    <div class="pt-2">${button(tel, page.cta.phoneButton, true)}</div>
  </div>
</section>

${extras("service")}

${
  page.process.length
    ? `<section class="px-4 py-14"><div class="mx-auto max-w-3xl"><h2 class="mb-8 text-2xl font-bold sm:text-3xl">${copy(page.headings.process)}</h2><ol class="space-y-6">${page.process
        .map(
          (s, i) =>
            `<li class="flex gap-4"><span class="flex size-10 shrink-0 items-center justify-center rounded-full font-bold text-white" style="background:var(--brand)">${i + 1}</span><div><h3 class="text-lg font-semibold">${s.confirm ? '<mark class="mr-2 rounded bg-amber-200 px-1 text-xs text-amber-950">[CONFIRM WITH CLIENT]</mark>' : ""}${copy(s.title)}</h3><p class="mt-1 text-slate-600">${copy(s.description)}</p></div></li>`
        )
        .join("")}</ol></div></section>`
    : ""
}

${extras("process")}

${
  page.socialProof.testimonials.length
    ? `<section class="px-4 py-14"><div class="mx-auto max-w-5xl"><h2 class="mb-8 text-center text-2xl font-bold sm:text-3xl">${copy(page.headings.socialProof)}</h2><div class="grid gap-5 sm:grid-cols-2">${page.socialProof.testimonials.map((t) => `<figure class="rounded-xl border border-slate-200 p-6"><blockquote class="text-slate-700">&ldquo;${copy(t.quote)}&rdquo;</blockquote><figcaption class="mt-3 text-sm font-semibold">${copy([t.name, t.detail].filter(Boolean).join(", "))}</figcaption></figure>`).join("")}</div></div></section>`
    : ""
}

${extras("proof")}

${
  page.faq.length
    ? `<section class="bg-slate-50 px-4 py-14"><div class="mx-auto max-w-3xl"><h2 class="mb-6 text-2xl font-bold sm:text-3xl">${copy(page.headings.faq)}</h2><div class="space-y-3">${page.faq.map((f) => `<details class="rounded-lg bg-white p-4 ring-1 ring-slate-200"><summary class="cursor-pointer font-semibold">${copy(f.question)}</summary><p class="mt-2 text-slate-600">${copy(f.answer)}</p></details>`).join("")}</div></div></section>`
    : ""
}

<section id="contact" class="px-4 py-16 text-center text-white" style="background:var(--brand)">
  <div class="mx-auto max-w-2xl space-y-4">
    <h2 class="text-2xl font-bold sm:text-3xl">${copy(page.cta.headline)}</h2>
    <p class="text-lg opacity-90">${copy(page.cta.description)}</p>
    <div class="flex flex-wrap justify-center gap-3 pt-2">
      <a href="${esc(tel)}" class="rounded-lg bg-white px-6 py-3 text-base font-semibold" style="color:var(--brand)">${copy(page.cta.phoneButton)}</a>
      <a href="${esc(wa)}" target="_blank" rel="noopener" class="rounded-lg border-2 border-white px-6 py-3 text-base font-semibold">${copy(page.cta.whatsappButton)}</a>
    </div>
  </div>
</section>
</main>

<footer class="px-4 py-6 text-center text-sm text-slate-500">&copy; ${new Date().getFullYear()} ${esc(clientName)}</footer>

<div class="fixed inset-x-0 bottom-0 z-10 grid grid-cols-2 gap-px bg-slate-200 sm:hidden">
  <a href="${esc(tel)}" class="bg-white py-3 text-center text-sm font-semibold" style="color:var(--brand)">${copy(page.cta.phoneButton)}</a>
  <a href="${esc(wa)}" target="_blank" rel="noopener" class="py-3 text-center text-sm font-semibold text-white" style="background:var(--brand)">${copy(page.cta.whatsappButton)}</a>
</div>
</body>
</html>
`
}
