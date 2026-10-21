import { NextResponse } from "next/server"

import { adsColumns, normalizeAdsResult } from "@/lib/ads-types"
import { db } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Save edits made to generated Facebook ads in the Ads workspace. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 })
  }

  const row = await db.generatedContent.findUnique({ where: { id } })
  if (!row || row.type !== "fb-ad") return NextResponse.json({ error: "That item no longer exists." }, { status: 404 })

  const result = normalizeAdsResult(asObject(body).result)
  if (!result) return NextResponse.json({ error: "The edited ads are not in the expected format." }, { status: 400 })

  const stored = asObject(asObject(row.metadata).result)
  if ((result.en !== undefined && !("en" in stored)) || (result.ar !== undefined && !("ar" in stored))) {
    return NextResponse.json({ error: "Languages cannot be added to a saved item." }, { status: 400 })
  }

  await db.generatedContent.update({
    where: { id },
    data: {
      ...adsColumns(result),
      metadata: { ...asObject(row.metadata), result, edited: true } as unknown as Prisma.InputJsonValue,
      humanized: false,
    },
  })
  return NextResponse.json({ id, savedAt: new Date().toISOString() })
}
