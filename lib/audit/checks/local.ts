import { fail, list, notChecked, pageAddress, pageCheck, pass, plural, short, siteCheck, warn, type CheckDef, type Ctx } from "@/lib/audit/checks/util"
import type { CrawledPage } from "@/lib/audit/crawl-types"
import { normalizeUrl } from "@/lib/audit/crawler"
import type { RawSchemaNode } from "@/lib/audit/extract"
import { digitsOnly, extractPhones, formatE164, phoneKey, validateUaePhone } from "@/lib/audit/phones"
import { wordOverlap } from "@/lib/audit/text"

const LOCAL_FAMILY = /^(MovingCompany|LocalBusiness|HomeAndConstructionBusiness|ProfessionalService|Store|GeneralContractor)$/i

const localNodes = (ctx: Ctx) => ctx.html.flatMap((p) => p.raw!.schema.filter((n) => n.types.some((t) => LOCAL_FAMILY.test(t))).map((n) => ({ p, n })))

/** Lowercase, no punctuation, no legal suffixes: so "Al Mezan Movers L.L.C" and "Al Mezan Movers" compare equal. */
const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(llc|l l c|ltd|fze|fzco|est|establishment|co|company|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()

type FoundPhone = { raw: string; key: string; valid: boolean; reason?: string; kind: string; where: Set<"tel link" | "text" | "schema"> }

/** Phone numbers a page shows: clickable tel: links, numbers in the header, footer and contact text, and schema telephones. */
function phonesOn(p: CrawledPage): FoundPhone[] {
  const raw = p.raw!
  const out = new Map<string, FoundPhone>()
  const add = (value: string, where: "tel link" | "text" | "schema") => {
    const info = validateUaePhone(value)
    const key = info.e164 ?? digitsOnly(value)
    if (key.length < 7) return
    const existing = out.get(key)
    if (existing) existing.where.add(where)
    else out.set(key, { raw: value.trim(), key, valid: info.valid, reason: info.reason, kind: info.kind, where: new Set([where]) })
  }
  raw.telLinks.forEach((t) => add(t, "tel link"))
  const text = [raw.footerText, raw.headerText, raw.addressEls.join(" "), /contact|about/i.test(p.path) || p.path === "/" ? raw.mainText : ""].join(" ")
  extractPhones(text).forEach((t) => add(t, "text"))
  raw.schema.forEach((n) => n.telephone && add(n.telephone, "schema"))
  return [...out.values()]
}

const profileKeys = (ctx: Ctx) => [ctx.client.phone, ctx.client.whatsapp].filter(Boolean).map(phoneKey)

function waNumber(href: string) {
  const m = /wa\.me\/\+?(\d{7,15})/i.exec(href) ?? /[?&]phone=\+?(\d{7,15})/i.exec(href)
  return m?.[1] ?? null
}

const completeness = (n: RawSchemaNode, ctx: Ctx) => {
  const missing: string[] = []
  if (!n.name) missing.push("name")
  if (!n.url) missing.push("url")
  if (!n.logo) missing.push("logo")
  if (!n.image) missing.push("image")
  if (!n.telephone) missing.push("telephone")
  if (ctx.isServiceArea) {
    if (!n.areaServed) missing.push("areaServed (required for a service-area business)")
  } else {
    const a = n.address
    if (!a) missing.push("address")
    else {
      if (!a.region) missing.push("address.addressRegion")
      if (!a.country || !/^(AE|UAE|United Arab Emirates)$/i.test(a.country.trim())) missing.push("address.addressCountry (AE)")
    }
    if (!n.areaServed) missing.push("areaServed")
  }
  if (!n.geo) missing.push("geo")
  if (!n.openingHours) missing.push("openingHours")
  if (!n.sameAs.length) missing.push("sameAs")
  if (!n.priceRange) missing.push("priceRange")
  return missing
}

export const checks: CheckDef[] = [
  /* ---------------------------------------------- local business schema */
  siteCheck({
    id: "schema-local",
    group: "local",
    name: "MovingCompany / LocalBusiness schema",
    severity: "critical",
    fix: "Add a MovingCompany (or LocalBusiness) JSON-LD block with name, address, telephone, areaServed and openingHours.",
    run: (ctx) => {
      const nodes = localNodes(ctx)
      if (!nodes.length) return fail("Not found", "No page declares the business as a local business type, so Google gets no entity data to match against your Business Profile.", { checked: 1, failed: 1 })
      const types = [...new Set(nodes.flatMap(({ n }) => n.types.filter((t) => LOCAL_FAMILY.test(t))))]
      return pass(types.join(", "), `Local business schema found (${types.join(", ")}) on ${list([...new Set(nodes.map(({ p }) => p.path))])}.`, { checked: 1, failed: 0 })
    },
  }),
  siteCheck({
    id: "schema-fields",
    group: "local",
    name: "Local schema has name, address and telephone",
    severity: "warning",
    fix: "Fill in name, address (PostalAddress) and telephone, matching your Google Business Profile exactly. A service-area business with no public street address can leave the address out and use areaServed instead.",
    run: (ctx) => {
      const nodes = localNodes(ctx)
      if (!nodes.length) return notChecked("There is no local business schema to inspect.")
      const ok = nodes.some(({ n }) => n.name && n.telephone && (ctx.isServiceArea || n.address))
      const best = nodes[0].n
      const missing = [!best.name && "name", !best.telephone && "telephone", !ctx.isServiceArea && !best.address && "address"].filter(Boolean)
      return ok
        ? pass("Complete", ctx.isServiceArea ? "Name and telephone are present. No street address is published, so none is required." : "Name, address and telephone are present.", { checked: 1, failed: 0 })
        : warn(`Missing ${missing.join(", ")}`, "An incomplete entity block is weaker than a complete one and can fail validation.", { urls: nodes.map(({ p }) => p.path), checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "local-schema-complete",
    group: "local",
    name: "Local schema completeness",
    severity: "warning",
    fix: "Add the missing properties: url, logo, image, geo coordinates, openingHours, areaServed, sameAs (social profiles) and priceRange, plus addressRegion and addressCountry AE when an address is published.",
    run: (ctx) => {
      const nodes = localNodes(ctx)
      if (!nodes.length) return notChecked("There is no local business schema to inspect.")
      const best = nodes.map(({ p, n }) => ({ p, n, missing: completeness(n, ctx) })).sort((a, b) => a.missing.length - b.missing.length)[0]
      return best.missing.length
        ? warn(`${best.missing.length} missing`, `The most complete ${best.n.types[0]} block (on ${best.p.path}) lacks: ${best.missing.join(", ")}.${ctx.isServiceArea ? " No street address was found on the site, so the business is treated as service-area based." : ""}`, { urls: best.missing, checked: 11, failed: best.missing.length })
        : pass("Complete", `The ${best.n.types[0]} block on ${best.p.path} covers name, url, logo, image, telephone, ${ctx.isServiceArea ? "areaServed" : "address (AE)"}, geo, openingHours, sameAs and priceRange.`, { checked: 11, failed: 0 })
    },
  }),
  siteCheck({
    id: "local-schema-rating",
    group: "local",
    name: "aggregateRating only with visible reviews",
    severity: "warning",
    fix: "Remove aggregateRating from the markup unless real customer reviews are shown on the same page. Google can penalise rating markup that visitors cannot see.",
    run: (ctx) => {
      const rated = ctx.html.filter((p) => p.raw!.schema.some((n) => n.aggregateRating))
      if (!rated.length) return pass("Not used", "No page declares aggregateRating, so there is nothing to mismatch.", { checked: 0, failed: 0 })
      const bad = rated.filter((p) => !p.raw!.hasVisibleReviews)
      return bad.length ? fail(plural(bad.length, "page"), "aggregateRating is declared on pages that show no visible reviews, which breaks Google's review snippet guidelines.", { urls: bad.map((p) => p.path), checked: rated.length, failed: bad.length }) : pass("Matches", "Pages with aggregateRating also show reviews.", { checked: rated.length, failed: 0 })
    },
  }),

  /* ------------------------------------------------------------------ NAP */
  siteCheck({
    id: "nap-name",
    group: "local",
    name: "Business name consistent",
    severity: "warning",
    fix: "Use the business name exactly as it appears on the client profile and Google Business Profile in schema, social tags and the footer.",
    run: (ctx) => {
      const ref = normName(ctx.client.name)
      const seen: { source: string; name: string; page: string }[] = []
      for (const p of ctx.html) {
        for (const n of p.raw!.schema) if (n.name && n.types.some((t) => LOCAL_FAMILY.test(t) || /Organization/i.test(t))) seen.push({ source: "schema", name: n.name, page: p.path })
        if (p.raw!.og["og:site_name"]) seen.push({ source: "og:site_name", name: p.raw!.og["og:site_name"], page: p.path })
      }
      const off = seen.filter((s) => normName(s.name) !== ref && wordOverlap(normName(s.name), ref) < 0.75)
      const home = ctx.home?.raw
      const inFooter = home ? normName(`${home.footerText} ${home.headerText}`).includes(ref) || (ctx.client.nameAr && `${home.footerText} ${home.headerText}`.includes(ctx.client.nameAr)) : true
      const groups = [
        ...[...new Set(off.map((o) => o.name))].map((name) => ({ label: `"${name}" (profile says "${ctx.client.name}")`, urls: off.filter((o) => o.name === name).map((o) => `${o.page} (${o.source})`) })),
        ...(inFooter ? [] : [{ label: "The business name does not appear in the homepage header or footer", urls: ["/"] }]),
      ]
      if (!seen.length && inFooter) return pass(ctx.client.name, "The business name appears on the homepage; no schema or social tag names it differently.", { checked: 1, failed: 0 })
      return groups.length ? warn(`${groups.length} inconsistent`, "The business name is written differently in different places. Variants split your identity in search engines.", { groups, urls: groups.flatMap((g) => g.urls), checked: seen.length + 1, failed: groups.length }) : pass(ctx.client.name, `${plural(seen.length, "mention")} in schema and social tags match the profile name.`, { checked: seen.length + 1, failed: 0 })
    },
  }),
  siteCheck({
    id: "nap-phone-valid",
    group: "local",
    name: "Phone numbers are valid UAE numbers",
    severity: "critical",
    fix: "Correct the number. UAE mobiles start +971 with 50, 52, 54, 55, 56 or 58; landlines use area codes 2, 3, 4, 6, 7 or 9. Numbers with another country code (for example +1) are not UAE numbers.",
    run: (ctx) => {
      const all = ctx.html.flatMap((p) => phonesOn(p).map((f) => ({ p, f })))
      if (!all.length) return warn("None found", "No phone number was found in tel: links, the header, the footer or the contact text.", { checked: 0, failed: 0 })
      const bad = all.filter(({ f }) => !f.valid)
      const distinct = new Set(all.map(({ f }) => f.key))
      if (!bad.length) return pass(`${distinct.size} valid`, `${plural(distinct.size, "number")} found, all valid UAE formats: ${list([...new Set(all.map(({ f }) => (f.key.startsWith("+971") ? formatE164(f.key) : f.raw)))])}.`, { checked: distinct.size, failed: 0 })
      const groups = [...new Set(bad.map(({ f }) => f.raw))].map((raw) => {
        const f = bad.find((b) => b.f.raw === raw)!.f
        return { label: `${raw}: ${f.reason}`, urls: [...new Set(bad.filter((b) => b.f.raw === raw).map((b) => b.p.path))] }
      })
      return fail(`${groups.length} invalid`, "A phone number on the site cannot be a working UAE number.", { groups, urls: groups.flatMap((g) => g.urls), checked: distinct.size, failed: groups.length })
    },
  }),
  siteCheck({
    id: "nap-phone-consistency",
    group: "local",
    name: "Phone number consistent across pages and profile",
    severity: "warning",
    fix: "Use the same number everywhere, in the same format, matching the client profile and Google Business Profile.",
    run: (ctx) => {
      const valid = ctx.html.flatMap((p) => phonesOn(p).filter((f) => f.valid).map((f) => ({ p, f })))
      if (!valid.length) return notChecked("No valid phone numbers were found to compare.")
      const known = [...new Set(profileKeys(ctx).filter((k) => k.startsWith("+971")))]
      // with no usable profile number, the most common number on the site is the reference
      let allowed = known
      if (!allowed.length) {
        const counts = new Map<string, number>()
        valid.forEach(({ f }) => counts.set(f.key, (counts.get(f.key) ?? 0) + 1))
        allowed = [[...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]]
      }
      const other = valid.filter(({ f }) => !allowed.includes(f.key))
      const groups = [...new Set(other.map(({ f }) => f.key))].map((key) => ({ label: `${formatE164(key)} is not the profile number`, urls: [...new Set(other.filter((o) => o.f.key === key).map((o) => o.p.path))] }))
      return groups.length
        ? warn(`${groups.length} other ${groups.length === 1 ? "number" : "numbers"}`, `${known.length ? `The profile lists ${allowed.map(formatE164).join(" and ")}` : `Most pages use ${formatE164(allowed[0])}`}, but other numbers also appear.`, { groups, urls: groups.flatMap((g) => g.urls), checked: new Set(valid.map(({ f }) => f.key)).size, failed: groups.length })
        : pass(allowed.map(formatE164).join(", "), `Every number on the site matches ${known.length ? "the client profile" : "the main number"}.`, { checked: new Set(valid.map(({ f }) => f.key)).size, failed: 0 })
    },
  }),
  pageCheck({
    id: "nap-tel-links",
    group: "local",
    name: "Phone numbers are clickable (tel: links)",
    severity: "warning",
    fix: 'Wrap the number in <a href="tel:+971…"> so visitors on phones can tap to call.',
    test: (p) => {
      const phones = phonesOn(p).filter((f) => f.valid && f.where.has("text"))
      if (!phones.length) return null
      const unlinked = phones.filter((f) => !f.where.has("tel link"))
      return { pass: unlinked.length === 0, detail: `${p.path} (${unlinked.map((f) => f.raw).join(", ")})` }
    },
    passMessage: "Visible phone numbers are tap-to-call links.",
    failMessage: "show a phone number as plain text, so visitors on phones cannot tap to call.",
  }),
  siteCheck({
    id: "nap-whatsapp",
    group: "local",
    name: "WhatsApp links use the correct number",
    severity: "warning",
    fix: "Point every wa.me link at the business's WhatsApp number from the client profile (digits only, with 971).",
    run: (ctx) => {
      const links = ctx.html.flatMap((p) => p.raw!.waLinks.map((href) => ({ p, href, num: waNumber(href) })))
      if (!links.length) return warn("No WhatsApp link", "No wa.me link was found. A WhatsApp button is one of the most-used ways to enquire with UAE movers.", { checked: 0, failed: 0 })
      const expected = profileKeys(ctx).map((k) => digitsOnly(k))
      const bad = links.filter((l) => !l.num || (expected.length > 0 && !expected.includes(l.num)) || !validateUaePhone(l.num).valid)
      const urls = bad.map((l) => `${l.href} on ${l.p.path}${l.num ? ` (${validateUaePhone(l.num).valid ? "not the profile number" : "not a valid UAE number"})` : " (no number in the link)"}`)
      return bad.length ? fail(plural(bad.length, "wrong link"), "Some WhatsApp links send customers to a different or invalid number.", { urls: [...new Set(urls)], checked: links.length, failed: bad.length }) : pass(plural(links.length, "link"), "Every WhatsApp link goes to the profile number.", { checked: links.length, failed: 0 })
    },
  }),
  siteCheck({
    id: "nap-address-visible",
    group: "local",
    name: "Business address shown as text",
    severity: "warning",
    fix: "Show the full street address as text in the footer or on the contact page (not only in an image or a map embed).",
    run: (ctx) => {
      if (ctx.isServiceArea)
        return pass("Service-area business", "No street address appears anywhere on the site, so the business is treated as service-area based (customers are visited, not the office). No address is required; list the areas served in schema and on the site instead.", { checked: 0, failed: 0 })
      const visible = ctx.html.map((p) => ({ p, a: pageAddress(p) })).filter((x) => x.a && x.a.source !== "schema")
      return visible.length
        ? pass(short(visible[0].a!.text, 70), `An address is shown as text on ${list([...new Set(visible.map((v) => v.p.path))])}.`, { checked: 1, failed: 0 })
        : warn("Only in structured data", "The address appears in schema but is not shown to visitors as text.", { checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "nap-address-consistency",
    group: "local",
    name: "Address consistent across pages",
    severity: "warning",
    fix: "Write the address identically everywhere: header, footer, contact page, schema and Google Business Profile.",
    run: (ctx) => {
      if (ctx.isServiceArea) return pass("Not applicable", "No street address was found, so the business is treated as service-area based.", { checked: 0, failed: 0 })
      const found = ctx.html.map((p) => ({ p, a: pageAddress(p) })).filter((x): x is { p: CrawledPage; a: NonNullable<ReturnType<typeof pageAddress>> } => x.a !== null)
      const variants: { text: string; pages: string[] }[] = []
      for (const { p, a } of found) {
        const match = variants.find((v) => wordOverlap(normName(v.text), normName(a.text)) >= 0.6)
        if (match) match.pages.push(p.path)
        else variants.push({ text: a.text, pages: [p.path] })
      }
      return variants.length > 1
        ? warn(`${variants.length} versions`, "The address is written differently on different pages.", { groups: variants.map((v) => ({ label: `"${short(v.text, 100)}"`, urls: [...new Set(v.pages)] })), urls: variants.flatMap((v) => v.pages), checked: found.length, failed: variants.length - 1 })
        : pass("Consistent", `The address reads the same on ${plural(found.length, "page")}.`, { checked: found.length, failed: 0 })
    },
  }),

  /* ------------------------------------------ area pages, map, reviews */
  siteCheck({
    id: "local-area-pages",
    group: "local",
    name: "Area landing pages are unique and linked",
    severity: "warning",
    fix: "Give every emirate or area its own page with a unique title, H1, content and schema, linked from the relevant service pages and back.",
    run: (ctx) => {
      const places = [ctx.client.emirate, ...ctx.client.emiratesServed, ...ctx.client.areas]
      if (!places.length) return notChecked("The client profile lists no emirates or areas.")
      if (!ctx.areaPages.length) return warn("No area pages", `No dedicated pages were found for ${list(places, 4)}. Pages per area help you appear for "movers in <area>" searches.`, { checked: places.length, failed: 1 })

      const titles = new Map<string, string[]>()
      const h1 = new Map<string, string[]>()
      for (const p of ctx.html) {
        titles.set(p.raw!.title.toLowerCase(), [...(titles.get(p.raw!.title.toLowerCase()) ?? []), p.path])
        const t = p.raw!.headings.find((h) => h.level === 1)?.text.toLowerCase() ?? ""
        h1.set(t, [...(h1.get(t) ?? []), p.path])
      }
      const issue = (label: string, test: (p: CrawledPage) => boolean) => ({ label, urls: ctx.areaPages.filter(test).map((p) => p.path) })
      const toService = (p: CrawledPage) => p.raw!.links.some((l) => ctx.servicePages.some((s) => s.url === normalizeUrl(l.href)))
      const fromService = (p: CrawledPage) => ctx.servicePages.some((s) => s.raw!.links.some((l) => normalizeUrl(l.href) === p.url))
      const groups = [
        issue("Title shared with another page", (p) => (titles.get(p.raw!.title.toLowerCase())?.length ?? 0) > 1),
        issue("H1 shared with another page", (p) => { const t = p.raw!.headings.find((h) => h.level === 1)?.text.toLowerCase() ?? ""; return Boolean(t) && (h1.get(t)?.length ?? 0) > 1 }),
        issue("No structured data", (p) => p.raw!.schema.length === 0),
        ...(ctx.servicePages.length ? [issue("Does not link to a service page", (p) => !toService(p)), issue("Not linked from any service page", (p) => !fromService(p))] : []),
      ].filter((g) => g.urls.length)
      return groups.length
        ? warn(`${groups.reduce((n, g) => n + g.urls.length, 0)} issues on ${plural(ctx.areaPages.length, "area page")}`, "Some area pages are not fully differentiated or connected.", { groups, urls: groups.flatMap((g) => g.urls), checked: ctx.areaPages.length * (ctx.servicePages.length ? 5 : 3), failed: groups.reduce((n, g) => n + g.urls.length, 0) })
        : pass(plural(ctx.areaPages.length, "area page"), "Every area page has a unique title, H1 and schema, and is linked with the service pages.", { checked: ctx.areaPages.length, failed: 0 })
    },
  }),
  siteCheck({
    id: "local-map-embed",
    group: "local",
    name: "Google Map embedded",
    severity: "info",
    fix: "Embed a Google Map on the contact page (the service-area or office location) to reinforce the local signal.",
    run: (ctx) => {
      const pages = ctx.html.filter((p) => p.raw!.mapEmbeds > 0)
      return pages.length ? pass(plural(pages.length, "page"), `A Google Map is embedded on ${list(pages.map((p) => p.path))}.`, { checked: 1, failed: 0 }) : warn("None", "No Google Map is embedded on any page.", { checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "local-gbp-link",
    group: "local",
    name: "Link to the Google Business Profile",
    severity: "info",
    fix: "Link to your Google Business Profile (and its reviews page) from the footer or contact page.",
    run: (ctx) => {
      const hit = ctx.html.flatMap((p) => p.raw!.gbpLinks.map((u) => ({ p, u })))[0]
      return hit ? pass(short(hit.u, 70), `A Google Business Profile link is on ${hit.p.path}.`, { checked: 1, failed: 0 }) : warn("Not linked", "No link to a Google Business Profile or Google Maps listing was found.", { checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "local-reviews",
    group: "local",
    name: "Visible reviews match review markup",
    severity: "info",
    fix: "Show real customer reviews on the site and mark them up with Review schema; do not add review markup for reviews visitors cannot see.",
    run: (ctx) => {
      const visible = ctx.html.filter((p) => p.raw!.hasVisibleReviews)
      const marked = ctx.html.filter((p) => p.raw!.schema.some((n) => n.hasReview || n.aggregateRating || n.types.some((t) => /^(Review|AggregateRating)$/i.test(t))))
      const markedWithoutVisible = marked.filter((p) => !p.raw!.hasVisibleReviews)
      if (markedWithoutVisible.length) return fail(plural(markedWithoutVisible.length, "page"), "Review markup is present on pages that show no reviews, which Google treats as misleading.", { urls: markedWithoutVisible.map((p) => p.path), checked: marked.length, failed: markedWithoutVisible.length })
      if (!visible.length) return warn("No reviews shown", "No reviews or testimonials are visible on the site. They are a strong trust signal for moving companies.", { checked: 1, failed: 1 })
      return marked.length ? pass("Reviews and markup match", `Reviews are shown on ${plural(visible.length, "page")} and marked up.`, { checked: visible.length, failed: 0 }) : warn("Reviews not marked up", `Reviews are visible on ${plural(visible.length, "page")} but have no Review schema.`, { urls: visible.map((p) => p.path), checked: visible.length, failed: visible.length })
    },
  }),
  pageCheck({
    id: "local-service-schema",
    group: "local",
    name: "Service schema on service pages",
    severity: "info",
    fix: "Add Service JSON-LD (name, description, provider, areaServed) to each service page.",
    pages: (ctx) => ctx.servicePages,
    test: (p) => ({ pass: p.raw!.schema.some((n) => n.types.some((t) => /^Service$/i.test(t))), detail: p.path }),
    passMessage: "Service pages carry Service schema.",
    failMessage: "have no Service schema.",
    skipWhen: (ctx) => (ctx.servicePages.length ? null : "No service pages could be identified from the client's services."),
  }),
  siteCheck({
    id: "local-gbp-lookup",
    group: "local",
    name: "Google Business Profile details",
    severity: "info",
    run: () => notChecked("Reading the live Google Business Profile (name, address, phone, categories) needs the Google Places or Business Profile API, which is not connected. NAP is compared with the client profile instead."),
  }),
]
