import { NextResponse } from "next/server"

import { buildCitationUpdate, countUntracked, initializeCitations, listClientCitations, toCitationDTO, type CitationUpdate } from "@/lib/citations"
import { DEFAULT_CATEGORY, isCategory } from "@/lib/constants"
import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"

type Ctx = { params: Promise<{ id: string }> }

async function clientCategory(id: string) {
  const client = await db.client.findUnique({ where: { id }, select: { category: true } })
  return client ? (isCategory(client.category) ? client.category : DEFAULT_CATEGORY) : null
}

/** Every directory tracked for the client, with the directory's details, plus how many relevant directories aren't tracked yet. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const category = await clientCategory(id)
    if (!category) return fail("That client no longer exists.", 404)
    const [citations, untracked] = await Promise.all([listClientCitations(id), countUntracked(id, category)])
    return NextResponse.json({ citations, untracked })
  } catch (error) {
    return handleError(error, "citations/list")
  }
}

/** Start tracking: creates an unchecked citation for every directory relevant to the client's category. Repeating it adds only new directories. */
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const category = await clientCategory(id)
    if (!category) return fail("That client no longer exists.", 404)
    const added = await initializeCitations(id, category)
    return NextResponse.json({ added, citations: await listClientCitations(id) }, { status: added ? 201 : 200 })
  } catch (error) {
    return handleError(error, "citations/init")
  }
}

/**
 * Update one citation: `{citationId, status?, nameMatch?, addressMatch?, phoneMatch?, websiteMatch?, listingUrl?, actionDone?}`.
 * Status and the four ticks are kept consistent (any wrong detail means "issues_found").
 * A backlink source takes `{citationId, linkUrl?, linkStatus?}` instead (linkStatus: "" | pending | live | dead).
 */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const b = await readJson(request)
    const citationId = typeof b.citationId === "string" ? b.citationId : ""
    if (!citationId) throw new BadRequestError("Missing citationId.")
    const current = await db.clientCitation.findFirst({ where: { id: citationId, clientId: id }, include: { source: true } })
    if (!current) return fail("That citation no longer exists.", 404)

    const data = buildCitationUpdate(current, b as CitationUpdate)
    const row = await db.clientCitation.update({ where: { id: citationId }, data, include: { source: true } })
    return NextResponse.json({ citation: toCitationDTO(row) })
  } catch (error) {
    return handleError(error, "citations/update")
  }
}
