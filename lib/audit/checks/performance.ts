import { config, homeMobile, sameUrl, notChecked, pageCheck, pass, plural, seconds, siteCheck, warn, fail, type CheckDef, type SiteOutcome } from "@/lib/audit/checks/util"
import type { LighthouseRun, Severity } from "@/lib/audit/types"

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`

/** A numeric Lighthouse metric on the homepage's mobile run, checked against a threshold. */
function lab(id: string, name: string, pick: (r: LighthouseRun) => number | null, limit: number, fmt: (v: number) => string, severity: Severity, fix: string, label: string, critical?: number) {
  return siteCheck({
    id,
    group: "performance",
    name,
    severity,
    fix,
    run: (ctx): SiteOutcome => {
      const run = homeMobile(ctx)
      if (!run) return notChecked("Lighthouse could not run for the homepage, so lab timings are unavailable.")
      const v = pick(run)
      if (v === null) return notChecked(`Lighthouse did not report ${label}.`)
      const ok = v <= limit
      const out = { checked: 1, failed: ok ? 0 : 1, urls: ok ? undefined : [`${label} ${fmt(v)}`] }
      const message = `Mobile Lighthouse on the homepage. Target: ${fmt(limit)} or better.`
      return ok ? pass(fmt(v), message, out) : critical !== undefined && v > critical ? fail(fmt(v), message, { ...out, severity: "critical" }) : warn(fmt(v), message, out)
    },
  })
}

/** A Lighthouse "opportunity" (an audit that names a saving) found in any of the runs. */
function opportunity(id: string, name: string, ids: string[], severity: Severity, fix: string, what: string) {
  return siteCheck({
    id,
    group: "performance",
    name,
    severity,
    fix,
    run: (ctx): SiteOutcome => {
      if (!ctx.lighthouse.length) return notChecked("Lighthouse could not run, so this could not be measured.")
      const hits = ctx.lighthouse.flatMap((r) => r.opportunities.filter((o) => ids.includes(o.id)).map((o) => ({ r, o })))
      if (!hits.length) return pass("No issues found", `Lighthouse found nothing to improve for ${what}.`, { checked: ctx.lighthouse.length, failed: 0 })
      const urls = hits.map(({ r, o }) => `${o.title} on ${new URL(r.url).pathname || "/"} (${r.device})${o.savingsMs ? ` — could save about ${seconds(o.savingsMs)}` : ""}${o.savingsBytes ? `${o.savingsMs ? ", " : " — could save "}${kb(o.savingsBytes)}` : ""}`)
      const ms = Math.max(...hits.map((h) => h.o.savingsMs), 0)
      return warn(ms ? `Up to ${seconds(ms)} to gain` : `${plural(hits.length, "finding")}`, `Lighthouse found ways to improve ${what}.`, { urls, checked: ctx.lighthouse.length, failed: hits.length })
    },
  })
}

export const checks: CheckDef[] = [
  siteCheck({
    id: "perf-score",
    group: "performance",
    name: "Mobile performance score (homepage)",
    severity: "warning",
    fix: "Compress and lazy-load images, defer non-critical scripts, and use modern image formats.",
    run: (ctx) => {
      const run = homeMobile(ctx)
      if (!run) return notChecked("Lighthouse could not run for the homepage, so there is no performance score.")
      const ok = run.score >= 90
      const out = { checked: 1, failed: ok ? 0 : 1, urls: ok ? undefined : [`Performance ${run.score}/100`] }
      const message = "Lighthouse rates how quickly the homepage loads and becomes usable on a mid-range phone."
      return ok ? pass(`${run.score}/100`, message, out) : run.score < 50 ? fail(`${run.score}/100`, message, { ...out, severity: "critical" }) : warn(`${run.score}/100`, message, out)
    },
  }),
  lab("lcp", "Largest Contentful Paint (lab, mobile)", (r) => r.lcpMs, 2500, seconds, "warning", "Optimise the hero image (size, format, preload) and reduce render-blocking CSS and scripts.", "LCP", 4000),
  lab("cls", "Cumulative Layout Shift (lab, mobile)", (r) => r.cls, 0.1, (v) => v.toFixed(2), "warning", "Set width and height on images and embeds, and reserve space for banners and fonts.", "CLS"),
  lab("tbt", "Total Blocking Time (lab, mobile)", (r) => r.tbtMs, 200, (v) => `${Math.round(v)} ms`, "warning", "Split or remove large scripts, defer third-party tags, and avoid long tasks.", "TBT"),
  lab("fcp", "First Contentful Paint (lab, mobile)", (r) => r.fcpMs, 1800, seconds, "info", "Inline critical CSS and cut render-blocking requests.", "FCP"),
  lab("speed-index", "Speed Index (lab, mobile)", (r) => r.speedIndexMs, 3400, seconds, "info", "Reduce the work done before the page paints: smaller images, less blocking JavaScript.", "Speed Index"),
  siteCheck({
    id: "perf-desktop",
    group: "performance",
    name: "Desktop performance score (homepage)",
    severity: "warning",
    fix: "Compress images and defer scripts; desktop scores are usually higher than mobile, so a low one points to something heavy.",
    run: (ctx) => {
      const run = ctx.lighthouse.find((r) => r.device === "desktop" && ctx.home && sameUrl(r.url, ctx.home.url))
      if (!run) return notChecked("The desktop Lighthouse run did not complete.")
      const ok = run.score >= 90
      const message = `Desktop Lighthouse: LCP ${run.lcpMs ? seconds(run.lcpMs) : "n/a"}, CLS ${run.cls?.toFixed(2) ?? "n/a"}, TBT ${run.tbtMs != null ? Math.round(run.tbtMs) + " ms" : "n/a"}.`
      return ok ? pass(`${run.score}/100`, message, { checked: 1, failed: 0 }) : warn(`${run.score}/100`, message, { urls: [`Performance ${run.score}/100`], checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "perf-landing",
    group: "performance",
    name: "Mobile performance of key landing pages",
    severity: "warning",
    fix: "Apply the same fixes as the homepage: lighter images, deferred scripts, less third-party code.",
    run: (ctx) => {
      const runs = ctx.lighthouse.filter((r) => r.device === "mobile" && !(ctx.home && sameUrl(r.url, ctx.home.url)))
      if (!runs.length) return notChecked("No landing pages were tested with Lighthouse (none found, or the runs did not complete).")
      const slow = runs.filter((r) => r.score < 90)
      const urls = runs.map((r) => `${new URL(r.url).pathname || "/"} — ${r.score}/100, LCP ${r.lcpMs ? seconds(r.lcpMs) : "n/a"}`)
      return slow.length ? warn(runs.map((r) => `${r.score}`).join(" / "), `${plural(slow.length, "landing page")} score below 90 on mobile.`, { urls, checked: runs.length, failed: slow.length }) : pass(runs.map((r) => `${r.score}`).join(" / "), "Key landing pages score 90 or better on mobile.", { urls, checked: runs.length, failed: 0 })
    },
  }),
  pageCheck({
    id: "ttfb",
    group: "performance",
    name: "Server response time",
    severity: "warning",
    fix: "Enable caching or a CDN, and check hosting capacity and slow database queries.",
    test: (p) => (p.raw!.ttfbMs > 0 ? { pass: p.raw!.ttfbMs <= config.slowTtfbMs, detail: `${p.path} (${p.raw!.ttfbMs} ms)` } : null),
    passMessage: `Pages start responding within ${config.slowTtfbMs} ms.`,
    failMessage: `take over ${config.slowTtfbMs} ms to start responding. Timings are measured while crawling and vary run to run.`,
  }),
  pageCheck({
    id: "load-time",
    group: "performance",
    name: "Page load time",
    severity: "info",
    fix: "Reduce page weight and the number of blocking requests.",
    // only needed when Lighthouse could not measure speed
    skipWhen: (ctx) => (homeMobile(ctx) ? "" : null),
    test: (p) => (p.raw!.loadMs > 0 ? { pass: p.raw!.loadMs <= 4000, detail: `${p.path} (${seconds(p.raw!.loadMs)})` } : null),
    passMessage: "Pages load in under 4 seconds.",
    failMessage: "take over 4 seconds to load.",
  }),

  opportunity("perf-render-blocking", "Render-blocking resources (Lighthouse)", ["render-blocking-resources", "render-blocking-insight"], "info", "Defer or inline the CSS and JavaScript that blocks the first paint.", "render-blocking CSS and JavaScript"),
  opportunity("perf-image-delivery", "Image delivery (Lighthouse)", ["uses-optimized-images", "modern-image-formats", "uses-responsive-images", "offscreen-images", "image-delivery-insight"], "warning", "Compress images, serve WebP or AVIF, size them to how they are displayed, and lazy-load those below the fold.", "image delivery"),
  opportunity("perf-caching", "Browser caching of static files", ["uses-long-cache-ttl", "cache-insight"], "info", "Serve images, CSS and JavaScript with long cache lifetimes (a year, with versioned file names).", "caching of static files"),
  opportunity("perf-minification", "CSS and JavaScript minified", ["unminified-javascript", "unminified-css"], "info", "Minify CSS and JavaScript at build time or with your caching plugin.", "minification"),
  opportunity("perf-unused-js", "Unused JavaScript", ["unused-javascript", "unused-css-rules"], "info", "Remove plugins and scripts that are not used, or load them only on the pages that need them.", "unused code"),

  siteCheck({
    id: "image-size",
    group: "performance",
    name: "Image file sizes",
    severity: "warning",
    fix: "Compress the large images and resize them to the largest size they are actually shown at.",
    run: (ctx) => {
      const probed = Object.values(ctx.crawl.probes.images).filter((i) => i.status === 200 && i.size)
      if (!probed.length) return notChecked("No image files could be measured.")
      const big = probed.filter((i) => i.size! > config.imageKbWarn * 1024).sort((a, b) => b.size! - a.size!)
      const urls = big.map((i) => `${i.url} (${kb(i.size!)}${i.width ? `, ${i.width}×${i.height}` : ""})`)
      const huge = big.filter((i) => i.size! > config.imageKbFail * 1024).length
      const note = ` ${plural(probed.length, "image")} measured.`
      return big.length ? warn(`${big.length} over ${config.imageKbWarn} KB`, `${plural(huge, "image")} over ${config.imageKbFail} KB.${note}`, { urls, checked: probed.length, failed: big.length }) : pass("All reasonable", `No image is over ${config.imageKbWarn} KB.${note}`, { checked: probed.length, failed: 0 })
    },
  }),
  siteCheck({
    id: "image-format",
    group: "performance",
    name: "Modern image formats (WebP / AVIF)",
    severity: "info",
    fix: "Convert JPEG and PNG images to WebP or AVIF; most CMS plugins can do this automatically.",
    run: (ctx) => {
      const probed = Object.values(ctx.crawl.probes.images).filter((i) => i.status === 200 && i.format)
      if (!probed.length) return notChecked("No image formats could be read.")
      const old = probed.filter((i) => i.format === "jpeg" || i.format === "png" || i.format === "gif")
      return old.length / probed.length > 0.5
        ? warn(`${old.length} of ${probed.length} are JPEG/PNG`, "Most images use older formats that are larger than WebP or AVIF.", { urls: old.slice(0, 30).map((i) => i.url), checked: probed.length, failed: old.length })
        : pass(`${probed.length - old.length} of ${probed.length} modern`, "Most images use WebP or AVIF.", { checked: probed.length, failed: old.length })
    },
  }),
  pageCheck({
    id: "image-lazy",
    group: "performance",
    name: "Below-the-fold images lazy-loaded",
    severity: "info",
    fix: 'Add loading="lazy" to images that are not visible without scrolling.',
    test: (p) => {
      const below = p.raw!.images.filter((i) => i.src && !i.inViewport && !i.src.startsWith("data:"))
      if (below.length < 2) return null
      const eager = below.filter((i) => i.loading !== "lazy").length
      return { pass: eager === 0, detail: `${p.path} (${eager} of ${below.length} below-the-fold images load immediately)` }
    },
    passMessage: "Below-the-fold images are lazy-loaded.",
    failMessage: "load images that are not visible immediately, which slows the first paint.",
  }),
  pageCheck({
    id: "image-oversized",
    group: "performance",
    name: "Images not oversized for how they are shown",
    severity: "info",
    fix: "Resize images to roughly the size they are displayed at (and serve responsive sizes with srcset).",
    test: (p) => {
      const loaded = p.raw!.images.filter((i) => i.natural[0] > 0 && i.rendered[0] > 0)
      if (!loaded.length) return null
      const oversized = loaded.filter((i) => i.natural[0] > i.rendered[0] * 2 && i.natural[0] > 600)
      return { pass: oversized.length === 0, detail: `${p.path} (${oversized.length} of ${loaded.length} measured images)` }
    },
    passMessage: "Images are close to their displayed size.",
    failMessage: "serve images more than twice as wide as they are displayed. Measured on the first pages crawled with images loaded.",
  }),
]

