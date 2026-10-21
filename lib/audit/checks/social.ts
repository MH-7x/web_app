import { notChecked, pageCheck, pass, short, siteCheck, warn, type CheckDef, type Ctx } from "@/lib/audit/checks/util"

type Profile = { id: string; name: string; host: RegExp; skip: RegExp; fix: string }

const PROFILES: Profile[] = [
  { id: "facebook", name: "Facebook page", host: /(^|\.)facebook\.com$/, skip: /^\/(sharer|share|dialog|plugins|tr|login|policies|help)\b/i, fix: "Create a Facebook business page and link it in the site footer." },
  { id: "x", name: "X (Twitter) profile", host: /(^|\.)(twitter|x)\.com$/, skip: /^\/(intent|share|home|i\/|hashtag|search)\b/i, fix: "Create an X profile for the business and link it in the site footer." },
  { id: "instagram", name: "Instagram profile", host: /(^|\.)instagram\.com$/, skip: /^\/(p|reel|explore|accounts|tv)\b/i, fix: "Create an Instagram business profile (before/after moves and crew photos work well) and link it in the footer." },
  { id: "linkedin", name: "LinkedIn page", host: /(^|\.)linkedin\.com$/, skip: /^\/(share|sharing|feed|login)\b/i, fix: "Create a LinkedIn company page and link it in the site footer." },
  { id: "youtube", name: "YouTube channel", host: /(^|\.)youtube\.com$/, skip: /^\/(watch|embed|playlist|shorts|results|feed)\b/i, fix: "Create a YouTube channel (move walkthroughs and customer tips) and link it in the site footer." },
]

/** First link to a real profile page (not a share button), looking at the links on every page and the schema's sameAs. */
function findProfile(ctx: Ctx, p: Profile): string | null {
  const urls = [...ctx.html.flatMap((pg) => pg.raw!.links.map((l) => l.href)), ...ctx.html.flatMap((pg) => pg.raw!.schema.flatMap((n) => n.sameAs))]
  for (const href of urls) {
    try {
      const u = new URL(href)
      if (p.host.test(u.hostname) && u.pathname.length > 1 && !p.skip.test(u.pathname)) return `${u.origin}${u.pathname.replace(/\/+$/, "")}`
    } catch {
      // not a URL
    }
  }
  return null
}

const profileCheck = (p: Profile): CheckDef =>
  siteCheck({
    id: `social-${p.id}`,
    group: "social",
    name: `${p.name} linked`,
    severity: "info",
    fix: p.fix,
    run: (ctx) => {
      const url = findProfile(ctx, p)
      return url ? pass(url, `${p.name} is linked from the site.`, { checked: 1, failed: 0 }) : warn("Not linked", `No link to a ${p.name} was found on any page. Linked profiles build trust and give search engines more signals about the business.`, { checked: 1, failed: 1 })
    },
  })

export const checks: CheckDef[] = [
  ...PROFILES.map(profileCheck),
  siteCheck({
    id: "social-youtube-activity",
    group: "social",
    name: "YouTube channel activity",
    severity: "info",
    run: (ctx) => {
      const channel = findProfile(
        ctx,
        PROFILES.find((p) => p.id === "youtube")!
      )
      return channel ? notChecked(`A YouTube channel is linked (${short(channel, 60)}), but reading its recent activity needs a YouTube Data API key, which is not configured.`) : notChecked("No YouTube channel is linked, so there is no activity to check.")
    },
  }),
  pageCheck({
    id: "social-open-graph",
    group: "social",
    name: "Open Graph tags (Facebook, WhatsApp, LinkedIn previews)",
    severity: "warning",
    fix: "Add og:title, og:description, og:image and og:url to every page. SEO plugins can do this for you.",
    test: (p) => {
      const og = p.raw!.og
      const missing = ["og:title", "og:description", "og:image", "og:url"].filter((k) => !og[k])
      return { pass: missing.length === 0, detail: `${p.path} (missing ${missing.map((m) => m.replace("og:", "")).join(", ")})` }
    },
    passMessage: "Every page has the Open Graph tags that control link previews.",
    failMessage: "are missing Open Graph tags, so shared links look bare in WhatsApp, Facebook and LinkedIn.",
  }),
  pageCheck({
    id: "social-twitter-cards",
    group: "social",
    name: "X (Twitter) Card tags",
    severity: "info",
    fix: 'Add <meta name="twitter:card" content="summary_large_image"> plus a title, description and image.',
    test: (p) => ({ pass: Boolean(p.raw!.twitter["twitter:card"]), detail: p.path }),
    passMessage: "Pages declare a Twitter Card.",
    failMessage: "have no twitter:card tag, so links shared on X get a plain preview.",
  }),
  siteCheck({
    id: "social-og-image",
    group: "social",
    name: "Open Graph image is valid (1200×630)",
    severity: "info",
    fix: "Use a 1200×630 pixel image served over HTTPS that returns 200, and set it as og:image.",
    run: (ctx) => {
      const probes = Object.values(ctx.crawl.probes.ogImages)
      if (!probes.length) return warn("No og:image", "No page declares an og:image, so shared links have no picture.", { checked: 1, failed: 1 })
      const problems = probes.flatMap((i) => {
        if (i.status !== 200) return [`${i.url} (HTTP ${i.status || "no response"})`]
        if (!/^image\//i.test(i.type)) return [`${i.url} (not an image: ${i.type || "unknown type"})`]
        if (i.width && i.height && (i.width < 1200 || i.height < 630)) return [`${i.url} (${i.width}×${i.height}, smaller than 1200×630)`]
        return []
      })
      const sample = probes[0]
      return problems.length
        ? warn(`${problems.length} of ${probes.length} need work`, "Some social-share images are missing, broken or smaller than the recommended 1200×630.", { urls: problems, checked: probes.length, failed: problems.length })
        : pass(sample.width ? `${sample.width}×${sample.height}` : "Reachable", `${probes.length} share ${probes.length === 1 ? "image is" : "images are"} reachable and at least 1200×630.`, { checked: probes.length, failed: 0 })
    },
  }),
]
