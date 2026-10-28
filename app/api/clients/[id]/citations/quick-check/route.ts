import { NextResponse } from "next/server"

import { listClientCitations } from "@/lib/citations"
import { checkUrl, isNapCitation } from "@/lib/citations-types"
import { db } from "@/lib/db"
import { fail, handleError } from "@/lib/gbp-posts-api"

/** A Google search for each directory not checked yet, `[{citationId, sourceName, searchUrl}]`, for the page to open as tabs. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const client = await db.client.findUnique({ where: { id }, select: { name: true } })
    if (!client) return fail("That client no longer exists.", 404)
    const checks = (await listClientCitations(id))
      .filter((c) => isNapCitation(c) && c.status === "unchecked")
      .map((c) => ({ citationId: c.id, sourceName: c.source.name, searchUrl: checkUrl(c.source, client.name) }))
    return NextResponse.json({ checks })
  } catch (error) {
    return handleError(error, "citations/quick-check")
  }
}
