import { NextResponse } from "next/server"

import { toCitationDTO } from "@/lib/citations"
import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { checkLink } from "@/lib/link-check"
import { getSession } from "@/lib/auth"

/**
 * Check a backlink: `{citationId}`. Loads the recorded link URL and sets the status to live or dead. When the site blocks the
 * check or times out nothing is proven, so the status is left as it was. Returns `{citation, result}`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { id } = await params
    const b = await readJson(request)
    const citationId = typeof b.citationId === "string" ? b.citationId : ""
    if (!citationId) throw new BadRequestError("Missing citationId.")
    const current = await db.clientCitation.findFirst({ where: { id: citationId, clientId: id }, include: { source: true, client: { select: { website: true } } } })
    if (!current) return fail("That citation no longer exists.", 404)
    if (current.source.sourceType !== "backlink") throw new BadRequestError("Only backlinks can be checked this way.")
    if (!current.linkUrl) throw new BadRequestError("Add the link URL first.")

    const result = await checkLink(current.linkUrl, current.client.website)
    const row =
      result.state === "unknown"
        ? current
        : await db.clientCitation.update({ where: { id: citationId }, data: { linkStatus: result.state, lastChecked: new Date() }, include: { source: true, client: { select: { website: true } } } })
    return NextResponse.json({ citation: toCitationDTO(row), result })
  } catch (error) {
    return handleError(error, "citations/check-link")
  }
}
