import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { savePaste } from "@/lib/humanizer-store"
import { PASTE_MAX_CHARS, parseStrictness } from "@/lib/humanizer-types"

const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, PASTE_MAX_CHARS * 2) : "")
const score = (v: unknown) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)))

/** Save a paste-mode rewrite to the client's Content History. */
export async function POST(request: Request) {
  try {
    const b = await readJson(request)
    if (typeof b.clientId !== "string" || !b.clientId) throw new BadRequestError("Select a client first.")
    const humanized = text(b.humanized)
    if (!humanized) throw new BadRequestError("There is nothing to save.")
    if (!(await db.client.findUnique({ where: { id: b.clientId }, select: { id: true } }))) return fail("That client no longer exists.", 404)

    const id = await savePaste({
      clientId: b.clientId,
      original: text(b.original),
      humanized,
      strictness: parseStrictness(b.strictness),
      beforeScore: score(b.beforeScore),
      afterScore: score(b.afterScore),
    })
    return NextResponse.json({ id })
  } catch (error) {
    return handleError(error, "humanizer/save")
  }
}
