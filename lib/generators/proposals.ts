import { GeminiError, generateText } from "@/lib/gemini"
import { getBusinessSettings } from "@/lib/settings"
import { loadTemplate } from "@/lib/prompts/store"
import { CORE_PAGES, FOCUSES, PROJECT_CATEGORIES, SECONDARY_SERVICES, computeTotal, formatAed, type ProjectInput } from "@/lib/proposals-types"

const label = <T extends { value: string; label: string }>(list: readonly T[], value: string) => list.find((o) => o.value === value)?.label ?? value
const weeks = (n: number) => `${n} ${n === 1 ? "week" : "weeks"}`
const months = (n: number) => `${n} ${n === 1 ? "month" : "months"}`
/** Keeps a value from breaking a markdown table row. */
const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim()

/** Core pages first, then the pages that were added. */
const allPages = (p: ProjectInput) => [...CORE_PAGES.filter((c) => p.corePages.includes(c.value)).map((c) => ({ name: c.label, type: "Core", notes: "" })), ...p.pages]

/** What the project includes, as facts for the model. Prices are left out: the pricing table is built in code. */
export function describeProject(p: ProjectInput) {
  const lines: string[] = []
  const add = (title: string, value: string | number) => value !== "" && value !== 0 && lines.push(`${title}: ${value}`)

  add("Client company", p.clientName)
  add("Contact person", p.contactName)
  add("Business type", label(PROJECT_CATEGORIES, p.category))
  add("Existing website", p.websiteUrl) // only when there is one
  add("About the company", p.companyDescription)
  add("Primary strategy", label(FOCUSES, p.projectFocus))

  const pages = allPages(p)
  lines.push("", `Website pages (${pages.length} in total, ${p.pages.filter((x) => x.type === "Service").length} service pages, ${p.pages.filter((x) => x.type === "Location").length} location pages):`)
  for (const pg of pages) lines.push(`- ${pg.name} (${pg.type})${pg.notes ? `: ${pg.notes}` : ""}`)

  lines.push("", "Included in the project:")
  lines.push(`- Website design and development (${pages.length} pages)`)
  if (p.seoMonths || p.projectFocus !== "ads") lines.push(`- SEO${p.seoMonths ? ` for ${months(p.seoMonths)}` : ""}`)
  if (p.adsIncluded) lines.push("- Google Ads management, included in the website development price at no extra charge")
  for (const s of p.secondaryServices) lines.push(`- ${label(SECONDARY_SERVICES, s)}`)
  for (const c of p.otherCosts) lines.push(`- ${c.name}`)

  lines.push("", `Estimated delivery time for the website: ${weeks(p.deliveryWeeks)}`)
  add("Payment terms", p.paymentTerms)
  return lines.join("\n")
}

/** Section name (lowercase) -> its markdown body, for the "##" sections of a model answer. */
function sectionsOf(markdown: string) {
  const out = new Map<string, string>()
  let current: string | null = null
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const h = /^#{1,3}\s+(.*?)\s*$/.exec(line)
    if (h && !line.startsWith("###")) {
      current = h[1].toLowerCase().replace(/[*_`]/g, "")
      out.set(current, "")
    } else if (current !== null) out.set(current, `${out.get(current)}${line}\n`)
  }
  return out
}

const pick = (sections: Map<string, string>, ...names: string[]) => {
  for (const [key, body] of sections) if (names.some((n) => key.includes(n)) && body.trim()) return body.trim()
  return ""
}

/** The two tables are built from the project, so the pages and every price are exactly what was entered. */
export function structureTable(p: ProjectInput) {
  const rows = allPages(p).map((pg) => `| ${cell(pg.name)} | ${pg.type} | ${cell(pg.notes) || "–"} |`)
  return ["| Page | Type | Notes |", "| :--- | :--- | :--- |", ...rows].join("\n")
}

export function pricingTable(p: ProjectInput) {
  const rows: string[] = []
  if (p.websiteCost > 0) rows.push(`| Website design and development | ${formatAed(p.websiteCost)} |`)
  if (p.seoCost > 0) rows.push(`| SEO${p.seoMonths ? ` (${months(p.seoMonths)})` : ""} | ${formatAed(p.seoCost)} |`)
  if (p.adsIncluded) rows.push("| Google Ads management | Included in website development |")
  if (p.socialCost > 0) rows.push(`| Social media setup | ${formatAed(p.socialCost)} |`)
  for (const c of p.otherCosts) if (c.amount > 0) rows.push(`| ${cell(c.name)} | ${formatAed(c.amount)} |`)
  rows.push(`| **Total** | **${formatAed(computeTotal(p))}** |`)
  return ["| Item | Cost |", "| :--- | :--- |", ...rows].join("\n")
}

/** Models sometimes wrap the whole answer in a code fence. */
const unfence = (text: string) => text.replace(/^```(?:markdown|md)?\s*\n/i, "").replace(/\n```\s*$/, "").trim()

/** The finished proposal: the model's writing around tables that come straight from the project. */
export function assembleProposal(project: ProjectInput, written: string) {
  const sections = sectionsOf(written)
  const summary = pick(sections, "executive summary", "summary")
  const services = pick(sections, "services", "deliverables")
  const timeline = pick(sections, "timeline")
  const next = pick(sections, "next steps")
  if (!summary || !services) throw new GeminiError("bad_response", "Gemini returned an incomplete proposal. Try again.", 502, true)

  const pageCount = allPages(project).length
  return [
    `## Executive Summary\n\n${summary}`,
    `## Proposed Website Structure\n\nThe website has ${pageCount} ${pageCount === 1 ? "page" : "pages"}.\n\n${structureTable(project)}`,
    `## Services & Deliverables\n\n${services}`,
    `## Pricing Breakdown\n\n${pricingTable(project)}${project.paymentTerms ? `\n\n**Payment terms:** ${project.paymentTerms}` : ""}`,
    `## Timeline\n\n${timeline || `The website is delivered in approximately ${weeks(project.deliveryWeeks)} from the start of the project.`}`,
    `## Next Steps\n\n${next || "1. Review this proposal and confirm the scope.\n2. Approve the proposal and make the first payment.\n3. We begin work on your project."}`,
  ].join("\n\n")
}

export async function generateProposal(project: ProjectInput): Promise<string> {
  const [business, template] = await Promise.all([getBusinessSettings(), loadTemplate("proposal")])
  const written = unfence(
    await generateText(`Prepared by: ${business.businessName}, ${business.tagline}\n\n${describeProject(project)}\n\nWrite the proposal.`, {
      systemInstruction: template.render({ business_name: business.businessName }),
      temperature: 0.4,
    })
  )
  return assembleProposal(project, written)
}
