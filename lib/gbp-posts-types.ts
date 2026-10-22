/** Types and date helpers for GBP Posts. No server imports, so the calendar UI can use them too. */

export const POST_CATEGORIES = [
  { id: "service-highlight", label: "Service highlight" },
  { id: "customer-tip", label: "Customer tip" },
  { id: "seasonal-offer", label: "Seasonal offer" },
  { id: "area-specific", label: "Area-specific" },
  { id: "trust-signal", label: "Trust signal" },
  { id: "behind-the-scenes", label: "Behind the scenes" },
] as const
export type PostCategory = (typeof POST_CATEGORIES)[number]["id"]
export const categoryLabel = (id: string) => POST_CATEGORIES.find((c) => c.id === id)?.label ?? id

export const POST_TYPES: Record<string, string> = { "whats-new": "What's New", offer: "Offer", event: "Event" }
export const CTAS: Record<string, { label: string }> = {
  call: { label: "Call Now" },
  "learn-more": { label: "Learn More" },
  book: { label: "Book" },
}
export const POST_STATUSES = ["draft", "approved", "published"] as const
export type PostStatus = (typeof POST_STATUSES)[number]

export const GBP_POST_MAX = 1500
export const MAX_WEEKS = 8
/** Every scheduled week gets exactly this many posts. */
export const POSTS_PER_WEEK = 3
export const MAX_KEYWORDS = 12
export type PostLanguage = "en" | "ar" | "both"
export const POST_LANGUAGES: PostLanguage[] = ["en", "ar", "both"]

/** What the calendar and detail panel need for one post. Dates are Dubai calendar days (YYYY-MM-DD). */
export type PostDTO = {
  id: string
  date: string
  category: string
  postType: string
  cta: string
  status: string
  language: PostLanguage
  textAr: string
  textEn: string
  keywords: string[]
  imagePrompt: string
  /** public https link of the photo sent to Google; empty for none */
  imageUrl: string
  /** ISO timestamps, or null */
  scheduledFor: string | null
  publishedAt: string | null
  /** Google's id for the live post */
  gbpPostId: string | null
}

/** "Oct 25 at 9:00 AM" in Dubai time. */
export const scheduleLabel = (iso: string) => {
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" }).format(d)
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Dubai" }).format(d)
  return `${day} at ${time}`
}

/* ------------------------------------------------------------ dates */

const DAY = 24 * 60 * 60 * 1000
const DUBAI_OFFSET = 4 * 60 * 60 * 1000 // UTC+4, no daylight saving

/** The calendar day a stored timestamp falls on in Dubai. */
export const dateKey = (d: Date) => new Date(d.getTime() + DUBAI_OFFSET).toISOString().slice(0, 10)

/** Stored scheduled time: 10:30 Dubai time on that day. */
export const toStoredDate = (key: string) => new Date(`${key}T10:30:00+04:00`)

const parse = (key: string) => new Date(`${key}T00:00:00Z`)
const fmt = (d: Date) => d.toISOString().slice(0, 10)

export const addDays = (key: string, n: number) => fmt(new Date(parse(key).getTime() + n * DAY))

/** 0 = Sunday. */
export const weekday = (key: string) => parse(key).getUTCDay()

/** The Sunday that starts the week containing `key`. */
export const weekStart = (key: string) => addDays(key, -weekday(key))

export const isMonthKey = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
export const isDateKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parse(v).getTime()) && fmt(parse(v)) === v

/** First day of the month and the first day after it (exclusive end). */
export const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number)
  return { start: `${month}-01`, end: fmt(new Date(Date.UTC(y, m, 1))) }
}

export const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(parse(`${month}-01`))

export const longDayLabel = (key: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parse(key))

/** Grid cells (Sunday-first) covering the month, including the days of neighbouring months. */
export function monthGrid(month: string) {
  const { start, end } = monthRange(month)
  const last = addDays(end, -1)
  const cells: { key: string; inMonth: boolean }[] = []
  for (let k = weekStart(start); k <= addDays(last, 6 - weekday(last)); k = addDays(k, 1)) cells.push({ key: k, inMonth: k >= start && k < end })
  return cells
}
