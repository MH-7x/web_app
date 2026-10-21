import { NextResponse } from "next/server"

import { BadRequestError, resultFromMetadata, type ContentType } from "@/lib/content-types"
import { db } from "@/lib/db"
import { handleError, readJson } from "@/lib/gbp-posts-api"
import { humanizeResult } from "@/lib/generators/humanizer"
import { parseContentPayload, parseStrictness } from "@/lib/humanizer-types"

/**
 * Humanize a generated piece of content and return the rewritten result with before/after scores. Nothing is saved.
 * Send either `{ id }` for a saved row, or `{ type, result }` for what is on screen in the Content preview.
 */
export async function POST(request: Request) {
  try {
    const b = await readJson(request)
    const strictness = parseStrictness(b.strictness)

    let type: ContentType
    let result
    if (typeof b.id === "string" && b.id) {
      const row = await db.generatedContent.findUnique({ where: { id: b.id } })
      if (!row) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 })
      const parsed = resultFromMetadata(row.type as ContentType, row.metadata)
      if (!parsed) throw new BadRequestError("That item cannot be humanized.")
      type = row.type as ContentType
      result = parsed
    } else {
      ;({ type, result } = parseContentPayload(b.type, b.result))
    }

    const out = await humanizeResult(type, result as never, strictness)
    return NextResponse.json({ type, result: out.result, units: out.units })
  } catch (error) {
    return handleError(error, "humanizer/content")
  }
}
