import { NextResponse } from "next/server"

import { getClientActivity } from "@/lib/client-activity"
import { db } from "@/lib/db"
import { fail, handleError } from "@/lib/gbp-posts-api"
import { getSession } from "@/lib/auth"

/** A client's activity timeline: generated content, ads, GBP posts and audits, newest first. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { id } = await params
    if (!(await db.client.findUnique({ where: { id }, select: { id: true } }))) return fail("That client no longer exists.", 404)
    return NextResponse.json({ items: await getClientActivity(id) })
  } catch (error) {
    return handleError(error, "activity")
  }
}
