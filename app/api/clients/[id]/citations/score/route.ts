import { NextResponse } from "next/server"

import { listClientCitations } from "@/lib/citations"
import { computeBacklinks, computeScore } from "@/lib/citations-types"
import { db } from "@/lib/db"
import { fail, handleError } from "@/lib/gbp-posts-api"

/**
 * The NAP consistency score: correct name, address, phone and website fields across the client's listings, as a percent of the
 * fields checked. `score` is null until a listing has been recorded. Includes the issues found, most serious first. Only NAP
 * citation sources are scored; `backlinks` counts the backlink sources separately ({total, live, pending, dead, notCreated}).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!(await db.client.findUnique({ where: { id }, select: { id: true } }))) return fail("That client no longer exists.", 404)
    const citations = await listClientCitations(id)
    return NextResponse.json({ ...computeScore(citations), backlinks: computeBacklinks(citations) })
  } catch (error) {
    return handleError(error, "citations/score")
  }
}
