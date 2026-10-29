import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { asObject, handleError, readJson } from "@/lib/gbp-posts-api"
import { approveUnits, type Approval } from "@/lib/humanizer-store"
import { getSession } from "@/lib/auth"

/** Replace the original text in a saved piece with the approved rewrite(s). */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const b = await readJson(request)
    if (typeof b.id !== "string" || !b.id) throw new BadRequestError("Missing item.")
    const approvals: Approval[] = (Array.isArray(b.units) ? b.units : []).slice(0, 200).map((u) => {
      const o = asObject(u)
      return {
        key: typeof o.key === "string" ? o.key : "",
        text: typeof o.text === "string" ? o.text.slice(0, 20000) : "",
        afterScore: Math.min(100, Math.max(0, Math.round(Number(o.afterScore) || 0))),
      }
    })
    if (!approvals.length) throw new BadRequestError("Nothing to approve.")
    return NextResponse.json(await approveUnits(b.id, approvals))
  } catch (error) {
    return handleError(error, "humanizer/approve")
  }
}
