import { NextResponse } from "next/server"

import {
  CONTENT_MODULE_TYPES,
  normalizeResult,
  toColumns,
  type ContentType,
} from "@/lib/content-types"
import { db } from "@/lib/db"
import { unitsOf } from "@/lib/humanizer-types"
import type { Prisma } from "@/lib/generated/prisma/client"

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Save edits made to a generated piece in the Content workspace. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 })
  }

  const row = await db.generatedContent.findUnique({ where: { id } })
  if (!row || !(CONTENT_MODULE_TYPES as string[]).includes(row.type)) {
    return NextResponse.json({ error: "That item no longer exists." }, { status: 404 })
  }
  const type = row.type as ContentType

  const result = normalizeResult(type, asObject(body).result)
  if (!result) return NextResponse.json({ error: "The edited content is not in the expected format." }, { status: 400 })

  // an edit can't add a language that was never generated
  const hadEn = "en" in asObject(asObject(row.metadata).result)
  const hadAr = "ar" in asObject(asObject(row.metadata).result)
  if ((result.en !== undefined && !hadEn) || (result.ar !== undefined && !hadAr)) {
    return NextResponse.json({ error: "Languages cannot be added to a saved item." }, { status: 400 })
  }

  // the Humanize button sends its score along so the saved item keeps its Humanized badge
  const humanizedScore = asObject(asObject(body).humanized).score
  const humanized = typeof humanizedScore === "number" && Number.isFinite(humanizedScore) ? Math.min(100, Math.max(0, Math.round(humanizedScore))) : null
  const meta = { ...asObject(row.metadata) }
  delete meta.humanizer

  const updated = await db.generatedContent.update({
    where: { id },
    data: {
      ...toColumns(type, result),
      metadata: {
        ...meta,
        result,
        edited: true,
        ...(humanized !== null && { humanizer: { units: Object.fromEntries(unitsOf(type, result).map((u) => [u.key, { score: humanized }])) } }),
      } as unknown as Prisma.InputJsonValue,
      humanized: humanized !== null,
      score: humanized,
    },
  })
  return NextResponse.json({ id: updated.id, savedAt: new Date().toISOString() })
}
