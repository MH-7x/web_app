import { NextResponse } from "next/server"

import { listCompetitors, toCompetitorDTO } from "@/lib/citations"
import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"

type Ctx = { params: Promise<{ id: string }> }

const MAX_COMPETITORS = 10

async function requireClient(id: string) {
  return db.client.findUnique({ where: { id }, select: { id: true } })
}

function parseName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : ""
  if (!name) throw new BadRequestError("Enter the competitor's name.")
  if (name.length > 100) throw new BadRequestError("The name is over 100 characters.")
  return name
}

/** Keep only ids of directories that exist, so a deleted directory can't linger in a competitor's list. */
async function parseSourceIds(value: unknown) {
  const ids = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
  const known = new Set((await db.citationSource.findMany({ where: { id: { in: ids }, sourceType: "nap_citation" }, select: { id: true } })).map((s) => s.id))
  return JSON.stringify([...new Set(ids.filter((i) => known.has(i)))])
}

/** The competitors tracked for the client and the directories each is listed on. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    if (!(await requireClient(id))) return fail("That client no longer exists.", 404)
    return NextResponse.json({ competitors: await listCompetitors(id) })
  } catch (error) {
    return handleError(error, "citations/competitors/list")
  }
}

/** Add a competitor: `{name, sourceIds?}`. Only yes or no per directory, no name/address/phone checks. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    if (!(await requireClient(id))) return fail("That client no longer exists.", 404)
    const b = await readJson(request)
    if ((await db.citationCompetitor.count({ where: { clientId: id } })) >= MAX_COMPETITORS) throw new BadRequestError(`You can track up to ${MAX_COMPETITORS} competitors.`)
    const row = await db.citationCompetitor.create({ data: { clientId: id, name: parseName(b.name), sourceIds: await parseSourceIds(b.sourceIds) } })
    return NextResponse.json({ competitor: toCompetitorDTO(row) }, { status: 201 })
  } catch (error) {
    return handleError(error, "citations/competitors/create")
  }
}

/** Edit a competitor: `{competitorId, name?, sourceIds?}`. */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const b = await readJson(request)
    const competitorId = typeof b.competitorId === "string" ? b.competitorId : ""
    if (!competitorId || !(await db.citationCompetitor.findFirst({ where: { id: competitorId, clientId: id }, select: { id: true } }))) return fail("That competitor no longer exists.", 404)
    const data = {
      ...(b.name !== undefined ? { name: parseName(b.name) } : {}),
      ...(b.sourceIds !== undefined ? { sourceIds: await parseSourceIds(b.sourceIds) } : {}),
    }
    if (!Object.keys(data).length) throw new BadRequestError("Nothing to update.")
    return NextResponse.json({ competitor: toCompetitorDTO(await db.citationCompetitor.update({ where: { id: competitorId }, data })) })
  } catch (error) {
    return handleError(error, "citations/competitors/update")
  }
}

/** Stop tracking a competitor: `?competitorId=`. */
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const competitorId = new URL(request.url).searchParams.get("competitorId")
    if (!competitorId) throw new BadRequestError("Missing competitorId.")
    await db.citationCompetitor.deleteMany({ where: { id: competitorId, clientId: id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleError(error, "citations/competitors/delete")
  }
}
