import { DEFAULT_CATEGORY, isCategory } from "@/lib/constants"
import { db } from "@/lib/db"
import type { Prisma, Review } from "@/lib/generated/prisma/client"
import { timeAgo } from "@/lib/format"
import { NEGATIVE_MAX_RATING, POSITIVE_MIN_RATING, isReplyStatus, type ReviewDTO, type ReviewSummary } from "@/lib/reviews-types"

type ReviewRow = Review & { client: { name: string; category: string } }

/** `now` is passed in so a list is labelled against a single instant. */
export function toReviewDTO(row: ReviewRow, now = new Date()): ReviewDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.client.name,
    clientCategory: isCategory(row.client.category) ? row.client.category : DEFAULT_CATEGORY,
    authorName: row.authorName,
    rating: row.rating,
    text: row.text,
    language: row.language,
    publishedAt: row.publishedAt.toISOString(),
    dateLabel: timeAgo(row.publishedAt, now),
    replyStatus: isReplyStatus(row.replyStatus) ? row.replyStatus : "none",
    replyDraft: row.replyDraft,
    repliedAt: row.repliedAt?.toISOString() ?? null,
  }
}

export type ReviewQuery = {
  clientId?: string
  /** "positive" (4–5), "negative" (1–3) or one star count */
  rating?: "positive" | "negative" | number
  replyStatus?: string
}

function whereFor({ clientId, rating, replyStatus }: ReviewQuery): Prisma.ReviewWhereInput {
  return {
    ...(clientId ? { clientId } : {}),
    ...(rating === "positive" ? { rating: { gte: POSITIVE_MIN_RATING } } : rating === "negative" ? { rating: { lte: NEGATIVE_MAX_RATING } } : typeof rating === "number" ? { rating } : {}),
    ...(isReplyStatus(replyStatus) ? { replyStatus } : {}),
  }
}

/** Newest first. Capped because the Places API only ever adds a handful per sync, so the table stays small. */
export async function listReviews(query: ReviewQuery, limit = 300) {
  const rows = await db.review.findMany({
    where: whereFor(query),
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: { client: { select: { name: true, category: true } } },
  })
  const now = new Date()
  return rows.map((r) => toReviewDTO(r, now))
}

/** Counts for the alert banner and empty states. They follow the selected client but ignore the list's rating and status filters on purpose. */
export async function getReviewSummary(clientId?: string): Promise<ReviewSummary> {
  const scope = clientId ? { clientId } : {}
  const [total, needsAttention, totalClients] = await Promise.all([
    db.review.count({ where: scope }),
    db.review.count({ where: { ...scope, rating: { lte: NEGATIVE_MAX_RATING }, replyStatus: "none" } }),
    db.client.count(),
  ])
  return { total, needsAttention, totalClients }
}

/** Clients for the filter dropdown and the add-review form. */
export async function listReviewClients() {
  return db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
}
