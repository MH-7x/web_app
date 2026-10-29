import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { handleError } from "@/lib/gbp-posts-api"
import { parseReviewFile, reviewKey } from "@/lib/review-import"
import type { ImportPreview } from "@/lib/reviews-types"
import { getSession } from "@/lib/auth"

const ARABIC = /[؀-ۿ]/
const SAMPLE_ROWS = 8
const MAX_PROBLEMS_SHOWN = 50

/**
 * Import reviews for one client from a CSV or Excel file (columns: Reviewer, Rating, Date, Review).
 * Send multipart form data: `clientId`, `file`, and `preview=1` to check the file and save nothing.
 * Valid rows are imported and bad rows are reported; a row already saved for the client (same reviewer, day and text) is skipped.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      throw new BadRequestError("Upload the file as form data.")
    }
    const clientId = form.get("clientId")
    const file = form.get("file")
    if (typeof clientId !== "string" || !clientId || !(await db.client.findUnique({ where: { id: clientId }, select: { id: true } }))) throw new BadRequestError("Choose a client.")
    if (!(file instanceof File)) throw new BadRequestError("Choose a file to upload.")

    const { rows, problems, total } = parseReviewFile(Buffer.from(await file.arrayBuffer()), file.name)

    const existing = await db.review.findMany({ where: { clientId }, select: { authorName: true, publishedAt: true, text: true } })
    const seen = new Set(existing.map((r) => reviewKey(r.authorName, r.publishedAt.toISOString().slice(0, 10), r.text)))
    const fresh = rows.filter((r) => {
      const k = reviewKey(r.authorName, r.date, r.text)
      if (seen.has(k)) return false
      seen.add(k) // a row repeated within the file counts as a duplicate too
      return true
    })
    const duplicates = rows.length - fresh.length

    if (form.get("preview") === "1") {
      const preview: ImportPreview = {
        total,
        willAdd: fresh.length,
        duplicates,
        problemCount: problems.length,
        problems: problems.slice(0, MAX_PROBLEMS_SHOWN),
        sample: fresh.slice(0, SAMPLE_ROWS),
      }
      return NextResponse.json(preview)
    }

    if (fresh.length === 0) throw new BadRequestError(duplicates ? "Every valid row in this file is already imported." : "There are no valid reviews in this file to import.")
    // one statement, so a failure can't leave half a file imported
    await db.review.createMany({
      data: fresh.map((r) => ({
        clientId,
        reviewId: `manual:${crypto.randomUUID()}`,
        authorName: r.authorName,
        rating: r.rating,
        text: r.text,
        language: ARABIC.test(r.text) ? "ar" : "en",
        publishedAt: new Date(`${r.date}T12:00:00Z`),
      })),
    })
    return NextResponse.json({ added: fresh.length, duplicates, problemCount: problems.length })
  } catch (error) {
    return handleError(error, "reviews/import")
  }
}
