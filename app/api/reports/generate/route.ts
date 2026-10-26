import { NextResponse } from "next/server"

import { getClient } from "@/lib/clients"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { db } from "@/lib/db"
import { getModelName } from "@/lib/gemini"
import { generateReport } from "@/lib/generators/reports"
import { buildStats, parseReportRequest, renderReportMarkdown } from "@/lib/reports-types"

/** Write a monthly report from manually entered figures and save it to the client's history. */
export async function POST(request: Request) {
  try {
    const { clientId, month, metrics, previous } = parseReportRequest(await readJson(request))
    const client = await getClient(clientId)
    if (!client) return fail("That client no longer exists.", 404)

    const report = await generateReport(client, month, metrics, previous)
    const stats = buildStats(metrics, previous)
    const row = await db.generatedContent.create({
      data: {
        clientId,
        type: "report",
        subtype: month.label,
        language: "en",
        content: renderReportMarkdown(client.name, month, stats, report),
        metadata: { month: month.key, metrics, previous: previous ?? null, report, model: getModelName() },
      },
    })
    return NextResponse.json({ id: row.id, report })
  } catch (error) {
    return handleError(error, "reports/generate")
  }
}
