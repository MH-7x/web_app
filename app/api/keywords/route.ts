import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { handleError, readJson } from "@/lib/gbp-posts-api"
import { cleanClientId, cleanName, listKeywordGroups, summarize, toData } from "@/lib/keyword-groups"
import { normalizeRows, MAX_KEYWORDS_PER_GROUP } from "@/lib/keywords-types"
import { getSession } from "@/lib/auth"

/** Every keyword group, without the keyword rows. */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json({ groups: await listKeywordGroups() })
  } catch (error) {
    return handleError(error, "keywords")
  }
}

/** Create a group, optionally with starting keywords. */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const b = await readJson(request)
    const keywords = normalizeRows(b.keywords)
    if (keywords.length > MAX_KEYWORDS_PER_GROUP) throw new BadRequestError("Too many keywords for one group.")
    const row = await db.keywordGroup.create({
      data: { name: cleanName(b.name), clientId: await cleanClientId(b.clientId), keywords: JSON.stringify(keywords) },
    })
    return NextResponse.json({ group: summarize(toData(row)) }, { status: 201 })
  } catch (error) {
    return handleError(error, "keywords")
  }
}
