import type { ClientCategory } from "@/lib/constants"

/** Types and constants for the review monitor that are safe to import from client components. */

export const REPLY_STATUSES = ["none", "drafted", "replied"] as const
export type ReplyStatus = (typeof REPLY_STATUSES)[number]

export const isReplyStatus = (value: unknown): value is ReplyStatus => (REPLY_STATUSES as readonly unknown[]).includes(value)

/** 4–5 stars is positive, 1–3 is negative (a 3 is a lukewarm review that still deserves a reply). */
export const POSITIVE_MIN_RATING = 4
export const NEGATIVE_MAX_RATING = 3

export type RatingFilter = "all" | "positive" | "negative"

export type ReviewFilters = { clientId?: string; rating?: RatingFilter; status?: ReplyStatus }

export const MAX_REPLY_LENGTH = 4000

export const REPLY_STATUS_LABEL: Record<ReplyStatus, string> = {
  none: "No reply",
  drafted: "Draft ready",
  replied: "Replied",
}

export type ReviewDTO = {
  id: string
  clientId: string
  clientName: string
  clientCategory: ClientCategory
  authorName: string
  rating: number
  text: string
  /** ISO 639-1 code from Google, e.g. "en" or "ar" */
  language: string
  publishedAt: string
  /** "3d ago", worked out on the server so the first render matches */
  dateLabel: string
  replyStatus: ReplyStatus
  replyDraft: string
  repliedAt: string | null
}

export type ReviewSummary = {
  total: number
  /** negative reviews nobody has replied to or drafted a reply for */
  needsAttention: number
  totalClients: number
}

/** A place found by the text search in the client form. */
export type PlaceResult = { placeId: string; name: string; address: string; rating: number | null; reviewCount: number | null }

export const MAX_REVIEW_TEXT = 5000
export const MAX_AUTHOR_NAME = 100

/** The paste-review form's body. */
export type NewReview = { clientId: string; authorName: string; rating: number; text: string; /** YYYY-MM-DD; today when empty */ date: string }

/* ------------------------------------------------------------- bulk import */

export const MAX_IMPORT_ROWS = 500
/** The file format shown to the user and written into the template. */
export const IMPORT_HEADERS = ["Reviewer", "Rating", "Date", "Review"] as const

/** One valid row of an import file. `date` is a calendar day, YYYY-MM-DD. */
export type ImportRow = { row: number; authorName: string; rating: number; text: string; date: string }
export type ImportProblem = { row: number; message: string }

export type ImportPreview = {
  /** data rows in the file, not counting the header or blank lines */
  total: number
  /** rows that will be added */
  willAdd: number
  /** rows already in the dashboard for this client, or repeated in the file */
  duplicates: number
  problemCount: number
  /** the first problems, enough to fix the file; `problemCount` is the full number */
  problems: ImportProblem[]
  /** the first rows that will be added */
  sample: ImportRow[]
}
