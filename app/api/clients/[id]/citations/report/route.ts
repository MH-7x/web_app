import { NextResponse } from "next/server"

import { listClientCitations, listCompetitors } from "@/lib/citations"
import { isListed } from "@/lib/citations-types"
import { DEFAULT_CATEGORY, isCategory } from "@/lib/constants"
import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { fail, handleError } from "@/lib/gbp-posts-api"
import { buildCitationReport } from "@/lib/generators/citation-report"
import { getSession } from "@/lib/auth"

/**
 * A citation report for a client meeting, as markdown: `{markdown}`. Covers the NAP score, directories listed, issues and their
 * status, a comparison with the top competitor (when competitors are tracked) and recommended next actions.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { id } = await params
    const client = await db.client.findUnique({ where: { id }, select: { name: true, category: true, emirate: true } })
    if (!client) return fail("That client no longer exists.", 404)

    const [citations, competitors] = await Promise.all([listClientCitations(id), listCompetitors(id)])
    if (!citations.some(isListed) && !citations.some((c) => c.status === "not_listed")) {
      throw new BadRequestError("Check at least one directory before exporting a report: mark where the client is listed or not listed.")
    }
    const markdown = await buildCitationReport({ name: client.name, category: isCategory(client.category) ? client.category : DEFAULT_CATEGORY, emirate: client.emirate }, citations, competitors)
    return NextResponse.json({ markdown })
  } catch (error) {
    return handleError(error, "citations/report")
  }
}
