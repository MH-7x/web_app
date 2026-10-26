import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { fail, handleError } from "@/lib/gbp-posts-api"
import { parseKeywordFile } from "@/lib/keyword-import"
import { parseStoredKeywords, toData } from "@/lib/keyword-groups"
import { MAX_KEYWORDS_PER_GROUP, mergeRows } from "@/lib/keywords-types"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Import a Google Keyword Planner export (CSV or XLSX) into a group.
 * Send multipart form data: `file`, optionally `preview=1` (parse only, save nothing) and `onDuplicate=skip|update`.
 */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      throw new BadRequestError("Upload the file as form data.")
    }
    const file = form.get("file")
    if (!(file instanceof File)) throw new BadRequestError("Choose a file to upload.")

    const group = await db.keywordGroup.findUnique({ where: { id } })
    if (!group) return fail("That group no longer exists.", 404)

    const { rows, skipped } = parseKeywordFile(Buffer.from(await file.arrayBuffer()), file.name)
    const existing = parseStoredKeywords(group.keywords)
    const onDuplicate = form.get("onDuplicate") === "update" ? "update" : "skip"
    const result = mergeRows(existing, rows, onDuplicate)

    if (form.get("preview") === "1") {
      return NextResponse.json({ preview: rows.slice(0, 10), total: rows.length, newCount: result.added, duplicateCount: result.skipped + result.updated, unreadable: skipped })
    }

    if (result.merged.length > MAX_KEYWORDS_PER_GROUP) throw new BadRequestError("This would put more keywords in the group than it can hold.")
    const saved = await db.keywordGroup.update({ where: { id }, data: { keywords: JSON.stringify(result.merged) } })
    return NextResponse.json({ keywords: toData(saved).keywords, added: result.added, updated: result.updated, skipped: result.skipped })
  } catch (error) {
    return handleError(error, "keywords/import")
  }
}
