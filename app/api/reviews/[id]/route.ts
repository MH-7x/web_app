import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { handleError } from "@/lib/gbp-posts-api"
import { getSession } from "@/lib/auth"

/** Delete a review, e.g. one that was pasted in by mistake. No error if it is already gone. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { id } = await params
    await db.review.deleteMany({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleError(error, "reviews/delete")
  }
}
