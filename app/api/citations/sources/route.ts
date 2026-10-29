import { NextResponse } from "next/server"

import { listSources, parseSourceInput, toSourceDTO } from "@/lib/citations"
import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { getSession } from "@/lib/auth"

/** A name is unique, so a second directory with the same name is refused instead of failing deep in the database. */
async function assertNameFree(name: string, exceptId?: string) {
  const clash = await db.citationSource.findUnique({ where: { name }, select: { id: true } })
  if (clash && clash.id !== exceptId) throw new BadRequestError(`A directory called "${name}" already exists.`)
}

/** The master list of directories, shared by every client. Optional filters: category, priority, relevantFor (moving | used_furniture | pickup_rental), sourceType (nap_citation | backlink). */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const p = new URL(request.url).searchParams
    const sources = await listSources({
      category: p.get("category") || undefined,
      priority: p.get("priority") || undefined,
      relevantFor: p.get("relevantFor") || undefined,
      sourceType: p.get("sourceType") || undefined,
    })
    return NextResponse.json({ sources })
  } catch (error) {
    return handleError(error, "citations/sources/list")
  }
}

/** Add a directory: `{name, url, submitUrl?, sourceType?, category?, relevantFor?, napFields?, isFree?, priority?, tier?, domainAuthority?, notes?}`. */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const data = parseSourceInput(await readJson(request), false)
    await assertNameFree(data.name as string)
    const row = await db.citationSource.create({ data: data as Parameters<typeof db.citationSource.create>[0]["data"] })
    return NextResponse.json({ source: toSourceDTO(row) }, { status: 201 })
  } catch (error) {
    return handleError(error, "citations/sources/create")
  }
}

/** Edit a directory: `{id, ...fields}`. Only the fields sent are changed. */
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const b = await readJson(request)
    const id = typeof b.id === "string" ? b.id : ""
    if (!id || !(await db.citationSource.findUnique({ where: { id }, select: { id: true } }))) return fail("That directory no longer exists.", 404)
    const data = parseSourceInput(b, true)
    if (!Object.keys(data).length) throw new BadRequestError("Nothing to update.")
    if (typeof data.name === "string") await assertNameFree(data.name, id)
    const row = await db.citationSource.update({ where: { id }, data })
    return NextResponse.json({ source: toSourceDTO(row) })
  } catch (error) {
    return handleError(error, "citations/sources/update")
  }
}

/** Remove a directory with `?id=`. Every client's citation record for it goes too. */
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const id = new URL(request.url).searchParams.get("id")
    if (!id) throw new BadRequestError("Missing id.")
    await db.citationSource.deleteMany({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleError(error, "citations/sources/delete")
  }
}
