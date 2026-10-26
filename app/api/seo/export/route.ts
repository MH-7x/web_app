import { reportHtml, reportMarkdown, type ReportInput } from "@/lib/audit/report"
import type { AuditPayloadV2, AuditScoresV2, KeywordCheck, LogEntry, RecommendationV2 } from "@/lib/audit/types"
import { db } from "@/lib/db"
import { fail, handleError } from "@/lib/gbp-posts-api"

const parseList = <T,>(raw: string): T[] => {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as T[]) : []
  } catch {
    return []
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "audit"

/** Download a saved audit as JSON (everything), Markdown or a self-contained HTML report. */
export async function GET(request: Request) {
  try {
    return await exportAudit(request)
  } catch (error) {
    return handleError(error, "seo/export")
  }
}

async function exportAudit(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("audit") ?? ""
  const format = searchParams.get("format") ?? "json"
  if (!["json", "md", "html"].includes(format)) return fail("Unknown format.", 400)

  const row = id ? await db.audit.findUnique({ where: { id }, include: { client: { select: { name: true } } } }) : null
  if (!row) return fail("That audit no longer exists.", 404)

  const scores = row.scores as unknown as AuditScoresV2
  if (scores?.version !== 2) return fail("This audit was run with the older audit and has no detailed report to export.", 400)
  const payload = row.findings as unknown as AuditPayloadV2
  const recommendations = row.recommendations as unknown as RecommendationV2[]

  const base = `${slug(row.client.name)}-seo-audit-${row.createdAt.toISOString().slice(0, 10)}`
  const keywordChecks = parseList<KeywordCheck>(row.keywordChecks)
  const input: ReportInput = { clientName: row.client.name, url: row.url, createdAt: row.createdAt, scores, payload, recommendations, keywordChecks }

  if (format === "json") {
    return new Response(JSON.stringify({ client: row.client.name, url: row.url, createdAt: row.createdAt.toISOString(), scores, ...payload, recommendations, keywordChecks, log: parseList<LogEntry>(row.log) }, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.json"` },
    })
  }
  if (format === "md") {
    return new Response(reportMarkdown(input), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.md"` } })
  }
  return new Response(reportHtml(input), { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.html"` } })
}
