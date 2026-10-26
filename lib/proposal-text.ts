import type { BusinessSettings } from "@/lib/business-types"

/** The proposal as plain text to paste into WhatsApp: headings and bold become *bold*, tables become lines. */
export function proposalText(input: { clientName: string; markdown: string; business: BusinessSettings; dateLabel: string }) {
  const { clientName, markdown, business, dateLabel } = input
  const body: string[] = []
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes("|")) continue // table divider
    if (/^\s*\|/.test(line)) {
      const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim().replace(/\*\*/g, ""))
      // the header row of a table is followed by a divider; show it in bold
      const isHeader = /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")
      body.push(isHeader ? `*${cells.join(" | ")}*` : `- ${cells.join(" | ")}`)
      continue
    }
    const heading = /^#{1,4}\s+(.*)$/.exec(line)
    if (heading) {
      body.push(`*${heading[1].replace(/\*\*/g, "")}*`)
      continue
    }
    body.push(line.replace(/\*\*([^*]+)\*\*/g, "*$1*").replace(/^(\s*)[*-]\s+/, "$1- "))
  }

  return [`${business.businessName} · ${business.tagline}`, dateLabel, "", `Proposal for ${clientName}`, "", body.join("\n").replace(/\n{3,}/g, "\n\n").trim(), ...(business.terms ? ["", "*Terms and conditions*", business.terms] : [])].join("\n")
}
