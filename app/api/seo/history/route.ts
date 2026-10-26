import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { handleError, readJson } from "@/lib/gbp-posts-api"

/** Delete one saved audit (`{ id }`), or every audit of a client (`{ clientId, all: true }`). */
export async function DELETE(request: Request) {
  try {
    const b = await readJson(request)
    if (typeof b.id === "string" && b.id) {
      const { count } = await db.audit.deleteMany({ where: { id: b.id } })
      return NextResponse.json({ deleted: count })
    }
    if (b.all === true && typeof b.clientId === "string" && b.clientId) {
      const { count } = await db.audit.deleteMany({ where: { clientId: b.clientId } })
      return NextResponse.json({ deleted: count })
    }
    throw new BadRequestError("Say which audit to delete.")
  } catch (error) {
    return handleError(error, "seo/history")
  }
}
