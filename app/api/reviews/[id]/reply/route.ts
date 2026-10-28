import { NextResponse } from "next/server"

import { getClient } from "@/lib/clients"
import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { draftReviewReply } from "@/lib/generators/review-reply"
import { MAX_REPLY_LENGTH } from "@/lib/reviews-types"

type Ctx = { params: Promise<{ id: string }> }

function replyText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : ""
  if (text.length > MAX_REPLY_LENGTH) throw new BadRequestError(`The reply is over ${MAX_REPLY_LENGTH} characters.`)
  return text
}

/**
 * One endpoint for the reply workflow, chosen by `action`:
 * - draft: ask Gemini for a reply and return `{text}`; nothing is stored until it is saved
 * - save: store `{text}` as the draft and mark the review "drafted"
 * - mark_replied: mark it "replied" now; an optional `{text}` keeps the reply that was actually posted
 */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const b = await readJson(request)
    const review = await db.review.findUnique({ where: { id } })
    if (!review) return fail("That review no longer exists.", 404)

    if (b.action === "draft") {
      const client = await getClient(review.clientId)
      if (!client) return fail("That client no longer exists.", 404)
      const text = await draftReviewReply(client, review)
      return NextResponse.json({ text })
    }

    if (b.action === "save") {
      const text = replyText(b.text)
      if (!text) throw new BadRequestError("Write a reply before saving it.")
      const updated = await db.review.update({ where: { id }, data: { replyDraft: text, replyStatus: "drafted", repliedAt: null } })
      return NextResponse.json({ replyStatus: updated.replyStatus, replyDraft: updated.replyDraft, repliedAt: null })
    }

    if (b.action === "mark_replied") {
      const text = b.text === undefined ? undefined : replyText(b.text)
      const updated = await db.review.update({
        where: { id },
        data: { replyStatus: "replied", repliedAt: new Date(), ...(text ? { replyDraft: text } : {}) },
      })
      return NextResponse.json({ replyStatus: updated.replyStatus, replyDraft: updated.replyDraft, repliedAt: updated.repliedAt?.toISOString() ?? null })
    }

    throw new BadRequestError("action must be draft, save or mark_replied.")
  } catch (error) {
    return handleError(error, "reviews/reply")
  }
}
