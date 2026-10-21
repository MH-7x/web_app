import { notChecked, pageCheck, pass, plural, seconds, short, siteCheck, warn, fail, type CheckDef, type Ctx, type SiteOutcome } from "@/lib/audit/checks/util"
import type { CruxMetric, CruxRecord } from "@/lib/audit/types"

type Rate = "good" | "needs" | "poor"
const rate = (v: number, good: number, poor: number): Rate => (v <= good ? "good" : v > poor ? "poor" : "needs")
const RATE_TEXT: Record<Rate, string> = { good: "good", needs: "needs improvement", poor: "poor" }

type Spec = { id: string; name: string; pick: (r: CruxRecord) => CruxMetric | null; good: number; poor: number; fmt: (v: number) => string; fix: string; label: string }

/** One field-data check per Core Web Vital: the 75th percentile of real visitors, per device, against Google's thresholds. */
function cruxCheck(spec: Spec): CheckDef {
  return siteCheck({
    id: spec.id,
    group: "usability",
    name: spec.name,
    severity: "warning",
    fix: spec.fix,
    run: (ctx: Ctx): SiteOutcome => {
      const crux = ctx.crux
      if (!crux) return notChecked("Real-user data was not requested for this audit.")
      const rows = crux.records.filter((r) => spec.pick(r)?.p75 != null)
      if (!rows.length) return notChecked(crux.unavailable ?? `Google has no real-user ${spec.label} data for this site yet.`)

      const lines = rows.map((r) => {
        const m = spec.pick(r)!
        const rt = rate(m.p75!, spec.good, spec.poor)
        return { r, m, rt, text: `${r.device === "phone" ? "Phone" : "Desktop"} ${spec.fmt(m.p75!)} (${RATE_TEXT[rt]})${r.scope === "origin" ? " · whole site" : ""}` }
      })
      const worst = lines.some((l) => l.rt === "poor") ? "poor" : lines.some((l) => l.rt === "needs") ? "needs" : "good"
      const urls = lines.map((l) => `${l.r.url} — ${l.text}${l.m.good != null ? ` · ${l.m.good}% good, ${l.m.needsImprovement}% needs improvement, ${l.m.poor}% poor` : ""}`)
      const value = lines.map((l) => l.text).join(" · ")
      const message = `75th percentile of real Chrome visitors. Good is ${spec.fmt(spec.good)} or better; poor is over ${spec.fmt(spec.poor)}.${crux.unavailable ? ` ${crux.unavailable}` : ""}`
      return worst === "good" ? pass(value, message, { urls, checked: lines.length, failed: 0 }) : worst === "needs" ? warn(value, message, { urls, checked: lines.length, failed: lines.filter((l) => l.rt !== "good").length }) : fail(value, message, { urls, checked: lines.length, failed: lines.filter((l) => l.rt !== "good").length })
    },
  })
}

export const checks: CheckDef[] = [
  pageCheck({
    id: "viewport",
    group: "usability",
    name: "Mobile viewport tag",
    severity: "warning",
    fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the head.',
    test: (p) => ({ pass: /width\s*=\s*device-width/i.test(p.raw!.viewport), detail: `${p.path}${p.raw!.viewport ? ` ("${short(p.raw!.viewport, 40)}")` : ""}` }),
    summarize: (_, ctx) => ({ value: ctx.home?.raw?.viewport ? `"${short(ctx.home.raw.viewport, 50)}"` : "missing" }),
    passMessage: "Every page has a correct mobile viewport tag.",
    failMessage: "lack a viewport tag with width=device-width, so they do not render properly on phones, which Google indexes first.",
  }),

  cruxCheck({ id: "cwv-lcp", name: "Core Web Vitals (real users): Largest Contentful Paint", pick: (r) => r.lcp, good: 2500, poor: 4000, fmt: seconds, fix: "Optimise the hero image (size, format, preload) and cut render-blocking CSS and scripts.", label: "LCP" }),
  cruxCheck({ id: "cwv-inp", name: "Core Web Vitals (real users): Interaction to Next Paint", pick: (r) => r.inp, good: 200, poor: 500, fmt: (v) => `${Math.round(v)} ms`, fix: "Split or defer heavy JavaScript so taps and clicks respond quickly.", label: "INP" }),
  cruxCheck({ id: "cwv-cls", name: "Core Web Vitals (real users): Cumulative Layout Shift", pick: (r) => r.cls, good: 0.1, poor: 0.25, fmt: (v) => v.toFixed(2), fix: "Set width and height on images and embeds, and reserve space for banners and fonts.", label: "CLS" }),

  pageCheck({
    id: "img-dimensions",
    group: "usability",
    name: "Image width and height set",
    severity: "warning",
    fix: "Add width and height attributes to images so the page does not jump around while loading.",
    test: (p) => {
      const imgs = p.raw!.images.filter((i) => i.src && !i.src.startsWith("data:"))
      if (!imgs.length) return null
      const missing = imgs.filter((i) => !i.widthAttr || !i.heightAttr).length
      return { pass: missing === 0, detail: `${p.path} (${missing} of ${imgs.length} images)` }
    },
    passMessage: "Images declare explicit dimensions.",
    failMessage: "have images without width and height, which causes layout shift while loading.",
  }),
  pageCheck({
    id: "render-blocking",
    group: "usability",
    name: "No render-blocking scripts in the head",
    severity: "warning",
    fix: "Add defer or async to scripts in the head, or move them to the end of the body.",
    test: (p) => {
      const blocking = p.raw!.scripts.filter((s) => s.inHead && !s.async && !s.defer && s.type !== "module")
      return { pass: blocking.length === 0, detail: `${p.path} (${plural(blocking.length, "blocking script")})` }
    },
    passMessage: "No page blocks rendering with synchronous head scripts.",
    failMessage: "load scripts in the head without defer or async, which delays the first paint.",
  }),
  siteCheck({
    id: "favicon",
    group: "usability",
    name: "Favicon specified",
    severity: "info",
    fix: 'Add <link rel="icon" href="/favicon.ico"> (or a PNG/SVG) to the head.',
    run: (ctx) => {
      const url = ctx.home?.raw?.favicons[0]
      return url ? pass(short(url, 80), "The homepage declares a favicon.", { checked: 1, failed: 0 }) : warn("Not declared", "No favicon is declared. It shows next to your site in browser tabs and some search results.", { checked: 1, failed: 1 })
    },
  }),
]
