import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { handleError, readJson } from "@/lib/gbp-posts-api"
import { listReviews, toReviewDTO } from "@/lib/reviews"
import { MAX_AUTHOR_NAME, MAX_REVIEW_TEXT, isReplyStatus } from "@/lib/reviews-types"
import { getSession } from "@/lib/auth"

const ARABIC = /[؀-ۿ]/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Reviews, newest first. Optional filters: clientId, rating (positive | negative | 1–5), replyStatus (none | drafted | replied). */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const params = new URL(request.url).searchParams
    const clientId = params.get("clientId") || undefined
    const ratingParam = params.get("rating")
    const replyStatus = params.get("replyStatus") || undefined

    let rating: "positive" | "negative" | number | undefined
    if (ratingParam === "positive" || ratingParam === "negative") rating = ratingParam
    else if (ratingParam) {
      rating = Number(ratingParam)
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new BadRequestError("rating must be positive, negative or a number from 1 to 5.")
    }
    if (replyStatus && !isReplyStatus(replyStatus)) throw new BadRequestError("replyStatus must be none, drafted or replied.")

    return NextResponse.json({ reviews: await listReviews({ clientId, rating, replyStatus }) })
  } catch (error) {
    return handleError(error, "reviews/list")
  }
}

/** Add a review copied from Google: `{clientId, authorName, rating, text, date?}`. The language is detected from the text. */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const b = await readJson(request)
    const clientId = typeof b.clientId === "string" ? b.clientId : ""
    const authorName = typeof b.authorName === "string" ? b.authorName.trim() : ""
    const text = typeof b.text === "string" ? b.text.trim() : ""
    const rating = typeof b.rating === "number" ? b.rating : NaN
    const date = typeof b.date === "string" && b.date ? b.date : ""

    if (!clientId || !(await db.client.findUnique({ where: { id: clientId }, select: { id: true } }))) throw new BadRequestError("Choose a client.")
    if (!authorName) throw new BadRequestError("Enter the reviewer's name.")
    if (authorName.length > MAX_AUTHOR_NAME) throw new BadRequestError(`The reviewer's name is over ${MAX_AUTHOR_NAME} characters.`)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new BadRequestError("Choose a star rating from 1 to 5.")
    if (text.length > MAX_REVIEW_TEXT) throw new BadRequestError(`The review text is over ${MAX_REVIEW_TEXT} characters.`)

    // a calendar day from the date picker; noon UTC keeps it on the same day in every timezone the app is used from
    let publishedAt = new Date()
    if (date) {
      const parsed = DATE.test(date) ? new Date(`${date}T12:00:00Z`) : null
      if (!parsed || Number.isNaN(parsed.getTime())) throw new BadRequestError("Pick a valid date.")
      if (parsed.getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestError("The review date can't be in the future.")
      publishedAt = parsed
    }

    const row = await db.review.create({
      data: { clientId, reviewId: `manual:${crypto.randomUUID()}`, authorName, rating, text, language: ARABIC.test(text) ? "ar" : "en", publishedAt },
      include: { client: { select: { name: true, category: true } } },
    })
    return NextResponse.json({ review: toReviewDTO(row) }, { status: 201 })
  } catch (error) {
    return handleError(error, "reviews/create")
  }
}
