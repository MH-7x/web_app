import { NextResponse } from "next/server"

import { db } from "@/lib/db"

/** Delete a review, e.g. one that was pasted in by mistake. No error if it is already gone. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.review.deleteMany({ where: { id } })
  return NextResponse.json({ ok: true })
}
