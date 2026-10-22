import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { toPostDTO } from "@/lib/gbp-posts"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { CTAS, GBP_POST_MAX, POST_STATUSES } from "@/lib/gbp-posts-types"

type Ctx = { params: Promise<{ id: string }> }

/** Edit a post: its text, CTA, image prompt or status. Only the fields sent are changed. */
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const b = await readJson(request)
    const data: Record<string, string | Date | null> = {}
    const row = await db.gBPPost.findUnique({ where: { id }, select: { language: true, status: true } })
    if (!row) return fail("That post no longer exists.", 404)

    for (const key of ["textAr", "textEn"] as const) {
      if (b[key] === undefined) continue
      const name = key === "textAr" ? "Arabic" : "English"
      if (row.language !== "both" && row.language !== (key === "textAr" ? "ar" : "en")) throw new BadRequestError(`This post was written in ${row.language === "ar" ? "Arabic" : "English"} only, so it has no ${name} version.`)
      const text = typeof b[key] === "string" ? b[key].trim() : ""
      if (!text) throw new BadRequestError(`${name} text can't be empty.`)
      if (text.length > GBP_POST_MAX) throw new BadRequestError(`${key === "textAr" ? "Arabic" : "English"} text is over ${GBP_POST_MAX} characters.`)
      data[key] = text
    }
    if (b.imagePrompt !== undefined) data.imagePrompt = typeof b.imagePrompt === "string" ? b.imagePrompt.trim().slice(0, 2000) : ""
    if (b.cta !== undefined) {
      if (typeof b.cta !== "string" || !(b.cta in CTAS)) throw new BadRequestError("Unknown call to action.")
      data.cta = b.cta
    }
    if (b.imageUrl !== undefined) {
      const url = typeof b.imageUrl === "string" ? b.imageUrl.trim() : ""
      if (url && !/^https:\/\/\S+$/i.test(url)) throw new BadRequestError("The image URL must be a public https link.")
      data.imageUrl = url.slice(0, 2000)
    }
    if (b.scheduledFor !== undefined) {
      if (b.scheduledFor === null) data.scheduledFor = null
      else {
        const when = typeof b.scheduledFor === "string" ? new Date(b.scheduledFor) : null
        if (!when || Number.isNaN(when.getTime())) throw new BadRequestError("Pick a valid date and time.")
        data.scheduledFor = when
      }
    }
    if (b.status !== undefined) {
      // a post that is live on Google can't be pulled back from here, and re-publishing it would duplicate it
      if (row.status === "published") throw new BadRequestError("This post is already published on Google Business Profile.")
      if (!(POST_STATUSES as readonly unknown[]).includes(b.status)) throw new BadRequestError("Unknown status.")
      data.status = b.status as string
    }
    if (!Object.keys(data).length) throw new BadRequestError("Nothing to update.")

    const updated = await db.gBPPost.update({ where: { id }, data }).catch(() => null)
    if (!updated) return fail("That post no longer exists.", 404)
    return NextResponse.json({ post: toPostDTO(updated) })
  } catch (error) {
    return handleError(error, "gbp-posts/patch")
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params
  await db.gBPPost.deleteMany({ where: { id } })
  return NextResponse.json({ ok: true })
}
