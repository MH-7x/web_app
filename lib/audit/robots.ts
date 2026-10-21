/** robots.txt parsing and matching, following Google's rules: most specific agent group, longest matching path wins, Allow beats Disallow on a tie. */

export type RobotsRules = { groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[]; sitemaps: string[] }

export function parseRobots(text: string): RobotsRules {
  const groups: RobotsRules["groups"] = []
  const sitemaps: string[] = []
  let current: RobotsRules["groups"][number] | null = null
  let lastWasAgent = false

  for (const line of text.split(/\r?\n/)) {
    const clean = line.split("#")[0].trim()
    const idx = clean.indexOf(":")
    if (idx < 0) continue
    const key = clean.slice(0, idx).trim().toLowerCase()
    const value = clean.slice(idx + 1).trim()

    if (key === "sitemap") {
      if (value) sitemaps.push(value)
    } else if (key === "user-agent") {
      // consecutive User-agent lines share one rule set
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if ((key === "allow" || key === "disallow") && current) {
      lastWasAgent = false
      if (value) current.rules.push({ allow: key === "allow", path: value })
    } else {
      lastWasAgent = false
    }
  }
  return { groups, sitemaps }
}

function toRegex(pattern: string) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
  return new RegExp("^" + escaped.replace(/\\\$$/, "$"))
}

/** Rules that apply to a crawler: the group naming it most specifically, otherwise the "*" group. */
function rulesFor(rules: RobotsRules, agent: string) {
  const name = agent.toLowerCase()
  let best = 0
  let chosen: RobotsRules["groups"] = []
  for (const g of rules.groups) {
    for (const a of g.agents) {
      if (a === "*" || !name.includes(a)) continue
      if (a.length > best) {
        best = a.length
        chosen = [g]
      } else if (a.length === best) chosen.push(g)
    }
  }
  if (!chosen.length) chosen = rules.groups.filter((g) => g.agents.includes("*"))
  return chosen.flatMap((g) => g.rules)
}

export function isAllowed(rules: RobotsRules, agent: string, path: string) {
  let verdict = true
  let bestLen = -1
  for (const r of rulesFor(rules, agent)) {
    if (!toRegex(r.path).test(path)) continue
    const len = r.path.length
    if (len > bestLen || (len === bestLen && r.allow)) {
      bestLen = len
      verdict = r.allow
    }
  }
  return verdict
}

export const SEARCH_BOTS = ["Googlebot", "Bingbot", "DuckDuckBot", "Baiduspider", "YandexBot", "Slurp"]

export const AI_BOTS = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "anthropic-ai", "PerplexityBot", "Google-Extended", "CCBot", "Applebot-Extended", "Bytespider", "Amazonbot", "meta-externalagent"]
