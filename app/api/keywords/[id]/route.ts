import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { cleanClientId, cleanName, getKeywordGroup, summarize, toData } from "@/lib/keyword-groups"
import { MAX_KEYWORDS_PER_GROUP, normalizeRows } from "@/lib/keywords-types"
import { getSession } from "@/lib/auth"

type Ctx = { params: Promise<{ id: string }> }

/** One group with all of its keywords. */
export async function GET(_request: Request, { params }: Ctx) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const group = await getKeywordGroup((await params).id)
    return group ? NextResponse.json({ group }) : fail("That group no longer exists.", 404)
  } catch (error) {
    return handleError(error, "keywords/get")
  }
}

/** Change the name, the client, or replace the keyword list. Fields that are not sent stay as they are. */
export async function PUT(request: Request, { params }: Ctx) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { id } = await params
    const b = await readJson(request)
    const data: { name?: string; clientId?: string | null; keywords?: string } = {}
    if ("name" in b) data.name = cleanName(b.name)
    if ("clientId" in b) data.clientId = await cleanClientId(b.clientId)
    if ("keywords" in b) {
      if (!Array.isArray(b.keywords)) throw new BadRequestError("Keywords must be a list.")
      const keywords = normalizeRows(b.keywords)
      if (keywords.length > MAX_KEYWORDS_PER_GROUP) throw new BadRequestError("Too many keywords for one group.")
      data.keywords = JSON.stringify(keywords)
    }
    if (!(await db.keywordGroup.findUnique({ where: { id }, select: { id: true } }))) return fail("That group no longer exists.", 404)
    const row = await db.keywordGroup.update({ where: { id }, data })
    return NextResponse.json({ group: toData(row), summary: summarize(toData(row)) })
  } catch (error) {
    return handleError(error, "keywords/put")
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    await db.keywordGroup.deleteMany({ where: { id: (await params).id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleError(error, "keywords/delete")
  }
}
