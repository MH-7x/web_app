import { NextResponse } from "next/server"

import { listClientCitations } from "@/lib/citations"
import { buildPlan } from "@/lib/citations-types"
import { db } from "@/lib/db"
import { fail, handleError } from "@/lib/gbp-posts-api"
import { getSession } from "@/lib/auth"

/** The prioritized action plan: fix wrong listings, then submit to missing Tier 1, Tier 2, industry and remaining directories, then the backlinks still to build (highest domain authority first). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { id } = await params
    if (!(await db.client.findUnique({ where: { id }, select: { id: true } }))) return fail("That client no longer exists.", 404)
    return NextResponse.json(buildPlan(await listClientCitations(id)))
  } catch (error) {
    return handleError(error, "citations/plan")
  }
}
