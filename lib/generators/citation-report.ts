import { SchemaType, type ResponseSchema } from "@google/generative-ai"

import { LINK_STATUS_LABEL, SEVERITY_LABEL, STATUS_LABEL, buildPlan, compareCompetitor, computeBacklinks, computeScore, isBacklink, isNapCitation, type CitationDTO, type CompetitorDTO } from "@/lib/citations-types"
import { CATEGORY_INFO, type ClientCategory } from "@/lib/constants"
import { generateJSON } from "@/lib/gemini"
import { NO_INVENTING } from "@/lib/prompts/shared"

type ReportClient = { name: string; category: ClientCategory; emirate: string }
type Narrative = { summary?: string; actions?: string[] }

const SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    actions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: ["summary", "actions"],
}

const SYSTEM = [
  "You write the narrative parts of a local SEO citation report that a marketing agency shows its client in a meeting.",
  "A citation is a business listing on a directory. NAP means name, address and phone: consistent details across directories help the business rank in local search, and wrong ones hurt.",
  "Use ONLY the figures and directory names in the data you are given. Never invent numbers, directories, rankings or results, and never promise rankings or leads.",
  "Write plainly and confidently for a business owner: no jargon, no hype, no stock phrases. Refer to the agency as 'we'.",
  "summary: two or three sentences on where the client stands and the single most important thing to do next.",
  "actions: four to six next steps, most important first. Follow the order of the plan you are given (fix wrong listings first, then missing Tier 1, then Tier 2, then industry directories, then backlinks to build). Each is one sentence that names the directories or sites involved.",
  "Backlinks are profiles and posts on other websites that link to the client's site. They have no name/address/phone details, so never mix them into the NAP figures.",
  NO_INVENTING,
].join("\n")

const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ")
const table = (head: string[], rows: string[][]) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n")
const names = (list: string[]) => (list.length ? list.join(", ") : "none")

/**
 * The citation report as markdown. Every number, table and list is built from the data; Gemini only writes the short summary and
 * the recommended next steps from those same facts, so it has nothing to get wrong about the figures.
 */
export async function buildCitationReport(client: ReportClient, all: CitationDTO[], competitors: CompetitorDTO[], today = new Date()) {
  const citations = all.filter(isNapCitation)
  const backlinks = computeBacklinks(all)
  const links = all.filter(isBacklink)
  const nap = computeScore(citations)
  const plan = buildPlan(all)
  const comparisons = competitors.map((c) => compareCompetitor(c, citations)).sort((a, b) => b.listedOn - a.listedOn)
  const top = comparisons[0]
  const clean = citations.filter((c) => c.status === "listed")
  const withIssues = citations.filter((c) => c.status === "issues_found")
  const missing = citations.filter((c) => c.status === "not_listed")

  const facts = {
    client: client.name,
    business: CATEGORY_INFO[client.category].label,
    emirate: client.emirate,
    napScorePercent: nap.score,
    fieldsCorrect: `${nap.correctFields} of ${nap.totalFields}`,
    listedDirectories: nap.listedCount,
    trackedDirectories: nap.trackedCount,
    listingsWithWrongDetails: withIssues.map((c) => `${c.source.name} (${c.issues.join(", ") || "details differ"})`),
    notListedOn: missing.map((c) => `${c.source.name} (tier ${c.source.tier})`),
    notCheckedYet: nap.uncheckedCount,
    backlinks: backlinks.total ? { tracked: backlinks.total, live: backlinks.live, pending: backlinks.pending, dead: backlinks.dead, notCreated: backlinks.notCreated } : null,
    topCompetitor: top ? { name: top.name, listedOn: top.listedOn, clientIsMissingFrom: top.missingFromClient.map((m) => m.name) } : null,
    actionPlanInOrder: plan.steps.filter((s) => s.items.length).map((s) => ({ step: s.title, directories: s.items.filter((i) => !i.done).map((i) => i.sourceName) })),
  }
  const narrative = await generateJSON<Narrative>(`Data:\n${JSON.stringify(facts, null, 2)}`, SCHEMA, { systemInstruction: SYSTEM, temperature: 0.4 })

  const out: string[] = [`# Citation report: ${client.name}`, `*${today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · ${client.emirate} · ${CATEGORY_INFO[client.category].label}*`]

  if (narrative.summary?.trim()) out.push("## Summary", narrative.summary.trim())

  out.push(
    "## NAP consistency score",
    nap.score === null
      ? "No listings have been recorded yet, so there is no score."
      : `**${nap.score}%.** ${nap.correctFields} of ${nap.totalFields} checked details are correct, with ${nap.issues.length} ${nap.issues.length === 1 ? "issue" : "issues"} found across ${nap.listedCount} ${nap.listedCount === 1 ? "listing" : "listings"}.`
  )

  out.push(
    "## Directory coverage",
    `Listed on **${nap.listedCount} of ${nap.trackedCount}** tracked directories.`,
    table(["Status", "Directories"], [
      [STATUS_LABEL.listed, `${clean.length}`],
      [STATUS_LABEL.issues_found, `${withIssues.length}`],
      [STATUS_LABEL.not_listed, `${missing.length}`],
      [STATUS_LABEL.unchecked, `${nap.uncheckedCount}`],
    ])
  )
  if (missing.length) out.push(`**Not listed on:** ${names(missing.map((c) => c.source.name))}.`)

  if (nap.issues.length) {
    const done = new Map(citations.map((c) => [c.id, c.actionDone]))
    out.push(
      "## Issues found",
      table(["Severity", "Directory", "Problem", "Status"], nap.issues.map((i) => [SEVERITY_LABEL[i.severity], i.sourceName, i.label, done.get(i.citationId) ? "Fix reported done, to be re-checked" : "Pending"]))
    )
  } else if (nap.listedCount > 0) {
    out.push("## Issues found", "No issues found. The name, address, phone and website match on every listing that was checked.")
  }

  if (backlinks.total) {
    const built = links.filter((c) => c.linkStatus).sort((a, b) => b.source.domainAuthority - a.source.domainAuthority)
    out.push(
      "## Backlinks",
      `**${backlinks.live} of ${backlinks.total}** backlink sources have a live link to the website. ${backlinks.pending} pending, ${backlinks.dead} dead, ${backlinks.notCreated} not created yet.`
    )
    if (built.length) out.push(table(["Source", "DA", "Link", "Status"], built.map((c) => [c.source.name, c.source.domainAuthority ? `${c.source.domainAuthority}` : "-", c.linkUrl || "-", LINK_STATUS_LABEL[c.linkStatus || "none"]])))
  }

  out.push("## Comparison with top competitor")
  if (!top) out.push("No competitors are being tracked yet.")
  else {
    out.push(
      table(["", "Directories listed on"], [
        [client.name, `${nap.listedCount} of ${nap.trackedCount}`],
        [top.name, `${top.listedOn} of ${nap.trackedCount}`],
      ]),
      top.missingFromClient.length ? `**${top.name} is listed on directories where ${client.name} is not:** ${names(top.missingFromClient.map((m) => (m.unchecked ? `${m.name} (not checked yet)` : m.name)))}.` : `${client.name} is listed everywhere ${top.name} is.`
    )
  }

  const actions = (narrative.actions ?? []).map((a) => a.trim()).filter(Boolean)
  if (actions.length) out.push("## Recommended next actions", actions.map((a, i) => `${i + 1}. ${a}`).join("\n"))

  return out.join("\n\n")
}
