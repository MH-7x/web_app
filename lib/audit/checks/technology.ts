import { fail, list, notChecked, pageCheck, pass, plural, short, siteCheck, warn, type CheckDef, type Ctx, type SiteOutcome } from "@/lib/audit/checks/util"
import type { Severity } from "@/lib/audit/types"

const isHttps = (ctx: Ctx) => ctx.crawl.origin.startsWith("https://")
const hostname = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** One security-header check. The header is read from the homepage response. */
function header(id: string, name: string, headerName: string, severity: Severity, fix: string, test: (headers: Record<string, string>) => boolean, onlyHttps = false) {
  return siteCheck({
    id,
    group: "technology",
    name,
    severity,
    fix,
    run: (ctx): SiteOutcome => {
      const h = ctx.crawl.probes.homeHeaders
      if (!h) return notChecked("The homepage response headers could not be read.")
      if (onlyHttps && !isHttps(ctx)) return notChecked("Only meaningful on an HTTPS site.")
      const value = h[headerName.toLowerCase()]
      return test(h) ? pass(short(value ?? "present", 80), `${headerName} is set.`, { checked: 1, failed: 0 }) : warn("Missing", `${headerName} is not set on the homepage response. Security headers protect visitors and are a basic trust signal.`, { checked: 1, failed: 1 })
    },
  })
}

export const checks: CheckDef[] = [
  /* ---------------------------------------------------------------- HTTPS */
  siteCheck({
    id: "https",
    group: "technology",
    name: "SSL enabled (HTTPS)",
    severity: "critical",
    fix: "Install a certificate and redirect all HTTP URLs to HTTPS.",
    run: (ctx) => {
      const tls = ctx.crawl.errors.filter((e) => /TLS|certificate/i.test(e.message))
      if (!isHttps(ctx)) return fail("HTTP only", "The site is served over HTTP, not HTTPS. Browsers flag it as not secure and Google prefers HTTPS.", { checked: 1, failed: 1 })
      return tls.length ? fail("Certificate problem", "The site uses HTTPS but the browser hit certificate errors.", { urls: tls.map((e) => `${e.url} (${e.message})`), checked: 1, failed: 1 }) : pass("HTTPS", "The site loads securely over HTTPS with no certificate errors.", { checked: 1, failed: 0 })
    },
  }),
  siteCheck({
    id: "tech-http-redirect",
    group: "technology",
    name: "HTTP redirects to HTTPS",
    severity: "critical",
    fix: "Add a permanent (301) redirect from every http:// URL to its https:// version at the server or CDN.",
    run: (ctx) => {
      const r = ctx.crawl.probes.httpRedirect
      if (!isHttps(ctx)) return notChecked("The site is not on HTTPS, so there is nothing to redirect to.")
      if (!r) return notChecked("The HTTP version could not be requested.")
      if (r.error) return warn("Not reachable", `The HTTP address did not answer (${r.error}). That is fine if nobody can reach it, but visitors typing http:// will see an error.`, { checked: 1, failed: 1 })
      const toHttps = r.finalUrl.startsWith("https://")
      const first = r.hops[0]?.status
      if (!toHttps) return fail("No redirect", `http:// stays on HTTP (final status ${r.finalStatus}), so visitors and Google can reach an insecure copy of every page.`, { urls: [r.url], checked: 1, failed: 1 })
      return first === 301 || first === 308 ? pass(`${first} → HTTPS`, "http:// redirects permanently to https://.", { checked: 1, failed: 0 }) : warn(`${first} → HTTPS`, "http:// redirects to https:// with a temporary redirect. Use 301 so search engines treat HTTPS as the permanent address.", { urls: [r.url], checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "tech-www",
    group: "technology",
    name: "One version of the domain (www vs non-www)",
    severity: "warning",
    fix: "Redirect the other host (www or non-www) with a 301 to your preferred one, and set that as the canonical host.",
    run: (ctx) => {
      const v = ctx.crawl.probes.hostVariants.find((x) => x.label === "www" || x.label === "non-www")
      if (!v) return notChecked("The alternate host could not be requested.")
      if (v.error) return pass("Alternate host not served", `${hostname(v.url) === hostname(ctx.crawl.origin) ? "" : new URL(v.url).hostname + " "}does not answer (${v.error}), so there is no duplicate site. Consider pointing it at the main site so mistyped links still work.`, { checked: 1, failed: 0 })
      const same = new URL(v.finalUrl).hostname === new URL(ctx.crawl.origin).hostname
      const status = v.hops[0]?.status
      if (same && (status === 301 || status === 308)) return pass(`${new URL(v.url).hostname} → ${new URL(ctx.crawl.origin).hostname}`, "The other host redirects permanently to the main one.", { checked: 1, failed: 0 })
      return same
        ? warn(`${status} redirect`, "The other host redirects, but not with a permanent 301.", { urls: [v.url], checked: 1, failed: 1 })
        : warn("Two live versions", `${new URL(v.url).hostname} serves the site separately from ${new URL(ctx.crawl.origin).hostname}, so every page exists twice.`, { urls: [v.url, v.finalUrl], checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "tech-trailing-slash",
    group: "technology",
    name: "One version of each URL (trailing slash)",
    severity: "info",
    fix: "Redirect the version of the URL with (or without) the trailing slash to the other, and canonicalise to one form.",
    run: (ctx) => {
      const v = ctx.crawl.probes.hostVariants.find((x) => x.label === "trailing slash")
      if (!v) return notChecked("No inner page was available to test the trailing-slash variant.")
      if (v.error) return notChecked(`The variant could not be requested (${v.error}).`)
      const redirected = v.hops.length > 1
      const final = new URL(v.finalUrl)
      const base = new URL(ctx.crawl.origin)
      const sameFinal = ctx.pages.some((p) => p.url === (final.origin + final.pathname).replace(/\/+$/, "") || p.url === final.origin + final.pathname)
      return redirected && sameFinal ? pass("Redirects to one form", "The slash and no-slash versions resolve to the same URL.", { checked: 1, failed: 0 }) : v.finalStatus === 200 && !redirected ? warn("Both versions load", "A URL answers 200 both with and without a trailing slash, so each page can be indexed twice unless a canonical tag settles it.", { urls: [v.url], checked: 1, failed: 1 }) : pass(`HTTP ${v.finalStatus}`, `The other form returns ${v.finalStatus}${base.host ? "" : ""}.`, { checked: 1, failed: 0 })
    },
  }),
  pageCheck({
    id: "tech-mixed-content",
    group: "technology",
    name: "No mixed content (HTTP resources on HTTPS pages)",
    severity: "warning",
    fix: "Change every http:// image, script, stylesheet and iframe URL to https://. Browsers block or warn about the insecure ones.",
    test: (p) => (p.url.startsWith("https://") ? { pass: p.raw!.mixedContent.length === 0, detail: `${p.path} (${plural(p.raw!.mixedContent.length, "insecure resource")}, e.g. ${short(p.raw!.mixedContent[0] ?? "", 60)})` } : null),
    passMessage: "No page loads insecure resources.",
    failMessage: "load images, scripts or other files over plain HTTP.",
  }),

  /* ------------------------------------------------------ security headers */
  header("tech-hsts", "HSTS header (Strict-Transport-Security)", "Strict-Transport-Security", "info", "Add Strict-Transport-Security: max-age=31536000; includeSubDomains at the server or CDN once HTTPS works everywhere.", (h) => Boolean(h["strict-transport-security"]), true),
  header("tech-xcto", "X-Content-Type-Options header", "X-Content-Type-Options", "info", "Add X-Content-Type-Options: nosniff.", (h) => /nosniff/i.test(h["x-content-type-options"] ?? "")),
  header("tech-xfo", "Clickjacking protection (X-Frame-Options or CSP frame-ancestors)", "X-Frame-Options", "info", "Add X-Frame-Options: SAMEORIGIN, or a Content-Security-Policy with frame-ancestors.", (h) => Boolean(h["x-frame-options"]) || /frame-ancestors/i.test(h["content-security-policy"] ?? "")),
  header("tech-csp", "Content-Security-Policy header", "Content-Security-Policy", "info", "Add a Content-Security-Policy that lists where scripts and styles may load from. Start in report-only mode.", (h) => Boolean(h["content-security-policy"])),
  header("tech-referrer-policy", "Referrer-Policy header", "Referrer-Policy", "info", "Add Referrer-Policy: strict-origin-when-cross-origin.", (h) => Boolean(h["referrer-policy"])),

  /* ---------------------------------------------------------- server, DNS */
  siteCheck({
    id: "tech-server-ip",
    group: "technology",
    name: "Server IP address",
    severity: "info",
    run: (ctx) => {
      const d = ctx.crawl.probes.dns
      return d?.ip ? pass(d.ip, `${new URL(ctx.crawl.origin).hostname} resolves to ${d.ip}.`, { checked: 1, failed: 0 }) : notChecked("The domain's IP address could not be looked up.")
    },
  }),
  siteCheck({
    id: "tech-dns-servers",
    group: "technology",
    name: "DNS (name) servers",
    severity: "info",
    run: (ctx) => {
      const d = ctx.crawl.probes.dns
      return d?.ns.length ? pass(list(d.ns, 4), `${d.domain} uses ${plural(d.ns.length, "name server")}: ${d.ns.join(", ")}.`, { checked: 1, failed: 0 }) : notChecked("The domain's name servers could not be looked up.")
    },
  }),
  siteCheck({
    id: "tech-web-server",
    group: "technology",
    name: "Web server / platform",
    severity: "info",
    run: (ctx) => {
      const h = ctx.crawl.probes.homeHeaders
      if (!h) return notChecked("The homepage response headers could not be read.")
      const parts = [h.server, h["x-powered-by"], h["x-generator"]].filter(Boolean)
      return parts.length ? pass(parts.join(" · "), `The server identifies itself as ${parts.join(", ")}.`, { checked: 1, failed: 0 }) : pass("Not disclosed", "The server does not reveal its software, which is a sensible security default.", { checked: 1, failed: 0 })
    },
  }),
  siteCheck({
    id: "tech-charset",
    group: "technology",
    name: "Character encoding",
    severity: "info",
    fix: 'Declare <meta charset="utf-8"> early in the head; it is essential for Arabic text.',
    run: (ctx) => {
      const h = ctx.crawl.probes.homeHeaders
      const meta = ctx.home?.raw?.charset
      const header = /charset=([^;\s]+)/i.exec(h?.["content-type"] ?? "")?.[1]
      const cs = (meta || header || "").toLowerCase()
      if (!cs) return warn("Not declared", "No character set was declared in the HTTP header or a meta tag.", { checked: 1, failed: 1 })
      return cs === "utf-8" || cs === "utf8" ? pass("UTF-8", "The page declares UTF-8, which handles Arabic and English.", { checked: 1, failed: 0 }) : warn(cs.toUpperCase(), "A character set other than UTF-8 can garble Arabic text.", { checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "tech-spf",
    group: "technology",
    name: "SPF record (email)",
    severity: "info",
    fix: 'Add a TXT record such as "v=spf1 include:_spf.google.com ~all" (use your mail provider\'s value) so your email is not marked as spam.',
    run: (ctx) => {
      const d = ctx.crawl.probes.dns
      if (!d || d.error) return notChecked("DNS TXT records could not be looked up.")
      if (!d.mx) return pass("No email set up", `${d.domain} has no mail servers (MX), so SPF is not needed.`, { checked: 1, failed: 0 })
      return d.spf ? pass(short(d.spf, 80), "An SPF record is published.", { checked: 1, failed: 0 }) : warn("Missing", "The domain receives email but has no SPF record, so messages sent from it are more likely to land in spam.", { checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "tech-dmarc",
    group: "technology",
    name: "DMARC record (email)",
    severity: "info",
    fix: 'Add a TXT record at _dmarc.yourdomain with at least "v=DMARC1; p=none; rua=mailto:you@yourdomain" and tighten the policy later.',
    run: (ctx) => {
      const d = ctx.crawl.probes.dns
      if (!d || d.error) return notChecked("DNS TXT records could not be looked up.")
      if (!d.mx) return pass("No email set up", `${d.domain} has no mail servers (MX), so DMARC is not needed.`, { checked: 1, failed: 0 })
      return d.dmarc ? pass(short(d.dmarc, 80), "A DMARC record is published.", { checked: 1, failed: 0 }) : warn("Missing", "No DMARC record is published, so anyone can send email that appears to come from your domain.", { checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "tech-analytics",
    group: "technology",
    name: "Analytics detected (GA4, Google Tag Manager)",
    severity: "info",
    fix: "Install Google Analytics 4 (directly or through Google Tag Manager) so calls, WhatsApp clicks and form leads can be measured.",
    run: (ctx) => {
      const found = { ga4: new Set<string>(), ua: new Set<string>(), gtm: new Set<string>() }
      let gtag = false
      for (const p of ctx.html) {
        p.raw!.analytics.ga4.forEach((i) => found.ga4.add(i))
        p.raw!.analytics.ua.forEach((i) => found.ua.add(i))
        p.raw!.analytics.gtm.forEach((i) => found.gtm.add(i))
        gtag ||= p.raw!.analytics.gtag
      }
      const parts = [found.ga4.size && `GA4 ${[...found.ga4].slice(0, 2).join(", ")}`, found.gtm.size && `Tag Manager ${[...found.gtm].slice(0, 2).join(", ")}`, found.ua.size && `Universal Analytics ${[...found.ua][0]} (retired in 2023)`].filter(Boolean)
      if (parts.length) return pass(parts.join(" · "), "Analytics is installed.", { checked: 1, failed: 0 })
      return gtag ? pass("gtag detected", "A Google tag is present.", { checked: 1, failed: 0 }) : warn("None detected", "No Google Analytics or Tag Manager was found. If tracking only loads after a cookie banner is accepted, it may not be visible to the audit.", { checked: 1, failed: 1 })
    },
  }),
]
