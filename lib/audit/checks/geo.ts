import { fail, list, notChecked, pass, plural, siteCheck, warn, type CheckDef } from "@/lib/audit/checks/util"
import { AI_BOTS, isAllowed } from "@/lib/audit/robots"

const IDENTITY = /^(Organization|Corporation|LocalBusiness|MovingCompany|HomeAndConstructionBusiness|ProfessionalService|Store|GeneralContractor|Person|NGO)$/i

export const checks: CheckDef[] = [
  siteCheck({
    id: "geo-llms-txt",
    group: "geo",
    name: "llms.txt file",
    severity: "info",
    fix: "Publish /llms.txt: a short Markdown summary of who you are, your services, areas and key pages, written for AI assistants.",
    run: (ctx) => {
      const l = ctx.crawl.llms
      if (!l) return notChecked("The request for /llms.txt could not be completed.")
      return l.ok ? pass(l.url, "llms.txt was found.", { checked: 1, failed: 0 }) : warn("Not found", "No llms.txt file was found. It is a new, optional convention that gives AI assistants a clean summary of the site.", { checked: 1, failed: 1 })
    },
  }),
  siteCheck({
    id: "geo-ai-crawlers",
    group: "geo",
    name: "AI crawlers allowed in robots.txt",
    severity: "warning",
    fix: "Remove the Disallow rules for the AI crawlers you want to be cited by (for example GPTBot, ClaudeBot, PerplexityBot, Google-Extended).",
    run: (ctx) => {
      const rules = ctx.crawl.robots?.status === 200 ? ctx.crawl.robots.rules : null
      if (!rules) return pass("All allowed", "There is no robots.txt, so AI crawlers are allowed by default.", { checked: AI_BOTS.length, failed: 0 })
      const blocked = AI_BOTS.filter((b) => !isAllowed(rules, b, "/"))
      return blocked.length
        ? warn(`${blocked.length} of ${AI_BOTS.length} blocked`, `robots.txt blocks ${list(blocked, 8)}. These assistants cannot read the site, so they cannot cite or recommend it. Blocking is a valid choice if intended.`, { urls: blocked, checked: AI_BOTS.length, failed: blocked.length })
        : pass("All allowed", `${plural(AI_BOTS.length, "major AI crawler")} are allowed.`, { checked: AI_BOTS.length, failed: 0 })
    },
  }),
  siteCheck({
    id: "geo-identity-schema",
    group: "geo",
    name: "Identity schema (Organization or Person)",
    severity: "warning",
    fix: "Add Organization or LocalBusiness JSON-LD to the homepage with name, url, logo and sameAs links to your social profiles.",
    run: (ctx) => {
      const nodes = ctx.html.flatMap((p) => p.raw!.schema.filter((n) => n.types.some((t) => IDENTITY.test(t))).map((n) => ({ p, n })))
      if (!nodes.length) return fail("None", "No Organization, LocalBusiness or Person schema was found, so AI assistants and search engines have no structured statement of who the business is.", { checked: 1, failed: 1 })
      const types = [...new Set(nodes.flatMap(({ n }) => n.types.filter((t) => IDENTITY.test(t))))]
      const specific = types.some((t) => !/^Organization$/i.test(t))
      return pass(types.join(", "), specific ? `Identity schema found: ${types.join(", ")}.` : "Organization schema found. A more specific type such as MovingCompany would describe the business better.", { checked: 1, failed: 0 })
    },
  }),
]
