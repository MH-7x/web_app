/**
 * Runs inside the browser page (via page.evaluate), so it must be completely self-contained:
 * no imports, no references to anything outside this function.
 */

export type RawImage = {
  src: string
  alt: string | null
  widthAttr: string | null
  heightAttr: string | null
  natural: [number, number]
  rendered: [number, number]
  loading: string | null
  top: number
  inViewport: boolean
}

export type RawLink = { href: string; text: string; rel: string; region: "nav" | "header" | "footer" | "main" }

export type RawSchemaNode = {
  types: string[]
  name: string | null
  url: string | null
  logo: boolean
  image: boolean
  telephone: string | null
  address: { street: string | null; locality: string | null; region: string | null; postal: string | null; country: string | null; text: string | null } | null
  geo: boolean
  openingHours: boolean
  areaServed: boolean
  sameAs: string[]
  priceRange: string | null
  aggregateRating: boolean
  hasReview: boolean
  faqQuestions: string[]
  hasItemList: boolean
  hasProvider: boolean
}

export type RawExtract = {
  title: string
  titlePx: number
  metaDescription: string
  metaPx: number
  canonicals: string[]
  robotsMeta: string
  lang: string
  dir: string
  charset: string
  viewport: string
  hreflang: { lang: string; href: string }[]
  headings: { level: number; text: string }[]
  images: RawImage[]
  links: RawLink[]
  scripts: { src: string; async: boolean; defer: boolean; type: string; inHead: boolean }[]
  stylesheets: { href: string; media: string }[]
  analytics: { ga4: string[]; ua: string[]; gtm: string[]; gtag: boolean }
  favicons: string[]
  og: Record<string, string>
  twitter: Record<string, string>
  schema: RawSchemaNode[]
  schemaInvalid: number
  bodyText: string
  mainText: string
  footerText: string
  headerText: string
  addressEls: string[]
  telLinks: string[]
  waLinks: string[]
  mapEmbeds: number
  gbpLinks: string[]
  hasVisibleReviews: boolean
  faq: { headingFound: boolean; items: number }
  cta: { tel: boolean; whatsapp: boolean; form: boolean; button: boolean }
  mixedContent: string[]
  ttfbMs: number
  loadMs: number
}

export function extractPage(opts: { viewportH: number }): RawExtract {
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim()
  const meta = (name: string) => clean(document.querySelector<HTMLMetaElement>('meta[name="' + name + '" i]')?.content)
  const abs = (href: string | null) => {
    try {
      return href ? new URL(href, document.baseURI).toString() : ""
    } catch {
      return ""
    }
  }

  const ctx = document.createElement("canvas").getContext("2d")
  const px = (text: string, font: string) => {
    if (!ctx || !text) return 0
    ctx.font = font
    return Math.round(ctx.measureText(text).width)
  }

  /* ----- schema (JSON-LD) ----- */
  const schema: RawSchemaNode[] = []
  let schemaInvalid = 0
  const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : v && typeof v === "object" && typeof (v as { name?: unknown }).name === "string" ? (v as { name: string }).name : null)
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== "object") return
    const o = value as Record<string, unknown>
    if (Array.isArray(o["@graph"])) visit(o["@graph"])
    const type = o["@type"]
    if (!type) return
    const addr = o.address
    const a = addr && typeof addr === "object" ? (addr as Record<string, unknown>) : null
    const main = o.mainEntity
    const questions = (Array.isArray(main) ? main : main ? [main] : []).map((q) => str((q as { name?: unknown })?.name)).filter((q): q is string => Boolean(q))
    schema.push({
      types: (Array.isArray(type) ? type : [type]).map(String),
      name: str(o.name),
      url: str(o.url),
      logo: Boolean(o.logo),
      image: Boolean(o.image),
      telephone: str(o.telephone),
      address: addr
        ? {
            street: a ? str(a.streetAddress) : null,
            locality: a ? str(a.addressLocality) : null,
            region: a ? str(a.addressRegion) : null,
            postal: a ? str(a.postalCode) : null,
            country: a ? str(a.addressCountry) : null,
            text: typeof addr === "string" ? addr : null,
          }
        : null,
      geo: Boolean(o.geo),
      openingHours: Boolean(o.openingHours || o.openingHoursSpecification),
      areaServed: Boolean(o.areaServed),
      sameAs: (Array.isArray(o.sameAs) ? o.sameAs : o.sameAs ? [o.sameAs] : []).map(String),
      priceRange: str(o.priceRange),
      aggregateRating: Boolean(o.aggregateRating),
      hasReview: Boolean(o.review),
      faqQuestions: questions,
      hasItemList: Boolean(o.itemListElement),
      hasProvider: Boolean(o.provider),
    })
  }
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      visit(JSON.parse(s.textContent ?? ""))
    } catch {
      schemaInvalid++
    }
  })

  /* ----- text blocks ----- */
  const bodyText = (document.body?.innerText ?? "").slice(0, 60000)
  const mainEl = document.querySelector("main, article, [role=main]")
  let mainText = ""
  if (mainEl) mainText = clean((mainEl as HTMLElement).innerText)
  else if (document.body) {
    const clone = document.body.cloneNode(true) as HTMLElement
    clone.querySelectorAll("header, nav, footer, aside, script, style, noscript, svg").forEach((n) => n.remove())
    mainText = clean(clone.textContent)
  }
  mainText = mainText.slice(0, 60000)
  // footer and header text keep their line breaks so an address can be told apart from the menu next to it
  const lines = (s: string) => s.replace(/[ \t\u00a0]+/g, " ").replace(/\n\s*\n+/g, "\n").trim()
  const footerText = lines(Array.from(document.querySelectorAll("footer")).map((f) => (f as HTMLElement).innerText).join("\n")).slice(0, 4000)
  const headerText = lines(Array.from(document.querySelectorAll("header, [class*=topbar i], [class*=top-bar i]")).map((f) => (f as HTMLElement).innerText).join("\n")).slice(0, 3000)
  const addressEls = Array.from(document.querySelectorAll('address, [itemprop="address"], [class*="address" i]'))
    .map((n) => lines((n as HTMLElement).innerText))
    .filter((t) => t.length > 8 && t.length < 600)
    .slice(0, 10)

  /* ----- links ----- */
  const region = (el: Element): RawLink["region"] => (el.closest("footer") ? "footer" : el.closest("nav") ? "nav" : el.closest("header") ? "header" : "main")
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
  const links: RawLink[] = anchors.slice(0, 700).map((a) => ({
    href: a.href,
    text: clean(a.innerText || a.getAttribute("aria-label") || a.querySelector("img")?.getAttribute("alt") || "").slice(0, 100),
    rel: (a.getAttribute("rel") ?? "").toLowerCase(),
    region: region(a),
  }))
  const telLinks = anchors.filter((a) => a.protocol === "tel:").map((a) => decodeURIComponent(a.getAttribute("href") ?? "").replace(/^tel:/i, "")).slice(0, 20)
  const waLinks = anchors.map((a) => a.href).filter((h) => /(^|\/\/)(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com)|^whatsapp:/i.test(h)).slice(0, 20)
  const gbpLinks = anchors.map((a) => a.href).filter((h) => /google\.[a-z.]+\/maps\/(place|dir)|g\.page\/|maps\.app\.goo\.gl|business\.google\.com|google\.[a-z.]+\/maps\?.*cid=|g\.co\/kgs/i.test(h)).slice(0, 10)
  const mapEmbeds = document.querySelectorAll('iframe[src*="google.com/maps" i], iframe[src*="maps.google" i], iframe[src*="google.com/maps/embed" i]').length

  /* ----- images ----- */
  const images: RawImage[] = Array.from(document.querySelectorAll("img"))
    .slice(0, 150)
    .map((img) => {
      const r = img.getBoundingClientRect()
      return {
        src: img.currentSrc || img.src || img.getAttribute("data-src") || "",
        alt: img.getAttribute("alt"),
        widthAttr: img.getAttribute("width"),
        heightAttr: img.getAttribute("height"),
        natural: [img.naturalWidth, img.naturalHeight],
        rendered: [Math.round(r.width), Math.round(r.height)],
        loading: img.getAttribute("loading"),
        top: Math.round(r.top + window.scrollY),
        inViewport: r.top < opts.viewportH,
      }
    })

  /* ----- scripts, styles, analytics ----- */
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]")).slice(0, 120).map((s) => ({ src: s.src, async: s.async, defer: s.defer, type: s.type, inHead: Boolean(s.closest("head")) }))
  const stylesheets = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet" i]')).slice(0, 60).map((l) => ({ href: l.href, media: l.media || "all" }))
  const inline = Array.from(document.querySelectorAll("script:not([src])")).map((s) => s.textContent ?? "").join("\n").slice(0, 200000)
  const allSrc = scripts.map((s) => s.src).join(" ")
  const uniq = (arr: string[] | null) => Array.from(new Set(arr ?? []))
  const analytics = {
    ga4: uniq((inline + " " + allSrc).match(/G-[A-Z0-9]{6,12}/g)),
    ua: uniq((inline + " " + allSrc).match(/UA-\d{4,10}-\d+/g)),
    gtm: uniq((inline + " " + allSrc).match(/GTM-[A-Z0-9]{4,8}/g)),
    gtag: /gtag\(|googletagmanager\.com\/gtag|google-analytics\.com\/(analytics|ga)\.js|GoogleAnalyticsObject/.test(inline + " " + allSrc),
  }

  /* ----- head metadata ----- */
  const og: Record<string, string> = {}
  document.querySelectorAll<HTMLMetaElement>('meta[property^="og:" i]').forEach((m) => {
    og[m.getAttribute("property")!.toLowerCase()] = clean(m.content)
  })
  const twitter: Record<string, string> = {}
  document.querySelectorAll<HTMLMetaElement>('meta[name^="twitter:" i]').forEach((m) => {
    twitter[m.getAttribute("name")!.toLowerCase()] = clean(m.content)
  })
  const title = clean(document.title)
  const metaDescription = meta("description")
  const charsetMeta = document.querySelector<HTMLMetaElement>("meta[charset]")?.getAttribute("charset") ?? document.querySelector<HTMLMetaElement>('meta[http-equiv="content-type" i]')?.content?.match(/charset=([^;\s]+)/i)?.[1] ?? ""

  /* ----- trust, CTA, FAQ ----- */
  const reviewSelector = '[itemprop="review"], [class*="testimonial" i], [class*="review" i], [id*="review" i], [id*="testimonial" i], [class*="rating" i]'
  const hasVisibleReviews = Array.from(document.querySelectorAll(reviewSelector)).some((n) => clean((n as HTMLElement).innerText).length > 40)

  const faqHeading = Array.from(document.querySelectorAll("h1, h2, h3, h4, summary")).some((h) => /\bfaq|frequently asked|الأسئلة الشائعة|اسئلة شائعة/i.test(h.textContent ?? ""))
  const faqItems = Math.max(document.querySelectorAll('[itemtype*="Question" i], [class*="faq" i] details, details summary, [class*="faq-item" i], [class*="accordion-item" i]').length, 0)

  const visibleTop = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.top < opts.viewportH && r.bottom > 0
  }
  const ctaText = /quote|get a|call|whatsapp|book|free estimate|contact|اتصل|واتساب|احجز|عرض سعر|تواصل/i
  const cta = {
    tel: anchors.some((a) => a.protocol === "tel:" && visibleTop(a)),
    whatsapp: anchors.some((a) => /wa\.me|whatsapp/i.test(a.href) && visibleTop(a)),
    form: Array.from(document.querySelectorAll("form")).some((f) => visibleTop(f) && f.querySelectorAll("input, textarea, select").length >= 2),
    button: Array.from(document.querySelectorAll("a, button")).some((n) => visibleTop(n) && ctaText.test(clean((n as HTMLElement).innerText)) && clean((n as HTMLElement).innerText).length < 40),
  }

  /* ----- mixed content ----- */
  const mixedContent: string[] = []
  if (location.protocol === "https:") {
    document.querySelectorAll("img[src], script[src], iframe[src], source[src], video[src], audio[src], link[href][rel~='stylesheet'], link[rel~='preload'][href]").forEach((n) => {
      const u = n.getAttribute("src") ?? n.getAttribute("href") ?? ""
      if (/^http:\/\//i.test(u) && mixedContent.length < 20) mixedContent.push(u)
    })
  }

  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined

  return {
    title,
    titlePx: px(title, "20px Arial"),
    metaDescription,
    metaPx: px(metaDescription, "14px Arial"),
    canonicals: Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="canonical" i]')).map((l) => abs(l.getAttribute("href"))),
    robotsMeta: [meta("robots"), meta("googlebot")].filter(Boolean).join(",").toLowerCase(),
    lang: clean(document.documentElement.lang),
    dir: clean(document.documentElement.dir || document.body?.dir),
    charset: charsetMeta,
    viewport: meta("viewport"),
    hreflang: Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="alternate" i][hreflang]')).map((l) => ({ lang: clean(l.getAttribute("hreflang")), href: abs(l.getAttribute("href")) })),
    headings: Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).slice(0, 200).map((h) => ({ level: Number(h.tagName[1]), text: clean((h as HTMLElement).innerText || h.textContent) })),
    images,
    links,
    scripts,
    stylesheets,
    analytics,
    favicons: Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon" i], link[rel="shortcut icon" i], link[rel="apple-touch-icon" i]')).map((l) => abs(l.getAttribute("href"))),
    og,
    twitter,
    schema,
    schemaInvalid,
    bodyText,
    mainText,
    footerText,
    headerText,
    addressEls,
    telLinks,
    waLinks,
    mapEmbeds,
    gbpLinks,
    hasVisibleReviews,
    faq: { headingFound: faqHeading, items: faqItems },
    cta,
    mixedContent,
    ttfbMs: nav ? Math.round(nav.responseStart) : 0,
    loadMs: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
  }
}
