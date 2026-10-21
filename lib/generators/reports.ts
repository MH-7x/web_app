import { SchemaType, type ResponseSchema } from "@google/generative-ai"

import type { ClientDetail } from "@/lib/clients"
import { GeminiError, generateJSON } from "@/lib/gemini"
import { loadTemplate } from "@/lib/prompts/store"
import { buildStats, type Metrics, type Month, type Report, type Stat } from "@/lib/reports-types"

const LIST = { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } } as const

const SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING, description: "Executive summary, 3 to 5 sentences." },
    wins: LIST,
    improvements: LIST,
    recommendations: LIST,
  },
  required: ["summary", "wins", "improvements", "recommendations"],
}

const sign = (n: number) => (n > 0 ? `+${n}` : String(n))

function describe(stats: Stat[], previousLabel: string) {
  return stats.map((s) => `- ${s.label}: ${s.display}${s.change ? ` (${sign(s.change.pct)}% vs ${previousLabel})` : ""}`).join("\n")
}

/** A narrative report (summary, wins, areas to improve, next-month recommendations) from manually entered figures. */
export async function generateReport(client: ClientDetail, month: Month, metrics: Metrics, previous?: Metrics): Promise<Report> {
  const stats = buildStats(metrics, previous)
  if (!stats.length) throw new GeminiError("bad_response", "There are no figures to report on.", 400)

  const prompt = `Client: ${client.name} (${client.emirate}, UAE)
Services: ${client.services.join(", ") || "moving services"}
Areas served: ${client.areas.join(", ") || client.emirate}
Report month: ${month.label}
Next month: ${month.nextLabel}
${previous ? `Comparison month: ${month.previousLabel}` : "No previous-month figures were supplied, so there is no month-over-month comparison."}

Figures for ${month.label}:
${describe(stats, month.previousLabel)}

Write the report.`

  const out = await generateJSON<Partial<Report>>(prompt, SCHEMA, { systemInstruction: (await loadTemplate("report")).render({}), temperature: 0.5 })
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((i): i is string => typeof i === "string" && i.trim() !== "").map((i) => i.trim()) : [])
  const report: Report = { summary: typeof out.summary === "string" ? out.summary.trim() : "", wins: list(out.wins), improvements: list(out.improvements), recommendations: list(out.recommendations) }
  if (!report.summary || !report.recommendations.length) throw new GeminiError("bad_response", "Gemini returned an incomplete report. Try again.", 502, true)
  return report
}
