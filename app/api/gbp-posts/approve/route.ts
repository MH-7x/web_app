import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { handleError, readJson } from "@/lib/gbp-posts-api"

/** Bulk approve: every listed draft of this client becomes approved. */
export async function POST(request: Request) {
  try {
    const b = await readJson(request)
    if (typeof b.clientId !== "string" || !b.clientId) throw new BadRequestError("Select a client first.")
    const ids = Array.isArray(b.ids) ? b.ids.filter((i): i is string => typeof i === "string").slice(0, 200) : []
    if (!ids.length) throw new BadRequestError("Select at least one draft.")
    const { count } = await db.gBPPost.updateMany({ where: { id: { in: ids }, clientId: b.clientId, status: "draft" }, data: { status: "approved" } })
    return NextResponse.json({ approved: count })
  } catch (error) {
    return handleError(error, "gbp-posts/approve")
  }
}
