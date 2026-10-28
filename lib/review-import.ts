import Papa from "papaparse"
import * as XLSX from "xlsx"

import { BadRequestError } from "@/lib/content-types"
import { MAX_UPLOAD_BYTES, decodeText } from "@/lib/keyword-import"
import { MAX_AUTHOR_NAME, MAX_IMPORT_ROWS, MAX_REVIEW_TEXT, type ImportProblem, type ImportRow } from "@/lib/reviews-types"

/** Reads a spreadsheet of reviews (Reviewer, Rating, Date, Review) from a CSV or Excel file. Bad rows are reported, not fatal. */

/** Header text with case, spaces and punctuation removed, so "Review text" and "review_text" match. */
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

type Field = "authorName" | "rating" | "date" | "text"
const HEADERS: Record<Field, string[]> = {
  authorName: ["reviewer", "reviewername", "name", "author", "authorname", "customer", "customername"],
  rating: ["rating", "stars", "star", "starrating", "score"],
  date: ["date", "dateposted", "reviewdate", "posted", "publishedat", "publisheddate"],
  text: ["review", "reviewtext", "text", "comment", "comments", "content", "body", "message"],
}
const COLUMN_NAME: Record<Field, string> = { authorName: "Reviewer", rating: "Rating", date: "Date", text: "Review" }

const MS_PER_DAY = 86_400_000
/** Excel counts days from 1899-12-30. Serials in this range are the years 1954 to 2119, so a stray number can't pass for one. */
const SERIAL_RANGE = [20_000, 80_000] as const

const dayKey = (y: number, m: number, d: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`

/** The day for an Excel date cell. Read as a plain serial number so the time zone can't shift it. */
function fromSerial(n: number) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * MS_PER_DAY)
  return dayKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** A real calendar day, so 31/02/2026 is rejected instead of rolling over to March. */
function validDay(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? dayKey(y, m, d) : null
}

/** "28/10/2026", "28-10-2026", "28.10.2026", "28/10/26" (day first) or "2026-10-28". A trailing time is ignored. Returns YYYY-MM-DD. */
export function parseReviewDate(value: unknown): string | null {
  if (typeof value === "number") return value >= SERIAL_RANGE[0] && value <= SERIAL_RANGE[1] ? fromSerial(value) : null
  const s = String(value ?? "").trim().replace(/[T\s]+\d{1,2}:\d{2}.*$/, "")
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)
  if (iso) return validDay(+iso[1], +iso[2], +iso[3])
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/.exec(s)
  if (!dmy) return null
  const year = dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3]
  return validDay(year, +dmy[2], +dmy[1])
}

/** 4, "4", "4.0" and "4 stars" are ratings; "4.5" and "7" are not. */
function parseRating(value: unknown): number | null {
  const m = /^(\d+(?:\.\d+)?)/.exec(String(value ?? "").trim())
  const n = m ? Number(m[1]) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}

function readTable(buf: Buffer, filename: string): unknown[][] {
  if (/\.xlsx?$/i.test(filename)) {
    const book = XLSX.read(buf, { type: "buffer" })
    const sheet = book.Sheets[book.SheetNames[0]]
    if (!sheet) throw new BadRequestError("That spreadsheet has no sheets.")
    // raw: dates arrive as serial numbers (exact) and ratings as numbers, never as locale-formatted text
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" })
  }
  const text = decodeText(buf)
  const delimiter = (text.split(/\r?\n/, 1)[0] ?? "").includes("\t") ? "\t" : ""
  return Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimiter }).data
}

const isBlank = (row: unknown[]) => row.every((c) => String(c ?? "").trim() === "")
const shown = (v: unknown) => String(v ?? "").trim()

export function parseReviewFile(buf: Buffer, filename: string): { rows: ImportRow[]; problems: ImportProblem[]; total: number } {
  if (buf.length === 0) throw new BadRequestError("That file is empty.")
  if (buf.length > MAX_UPLOAD_BYTES) throw new BadRequestError("That file is larger than 5 MB.")
  if (!/\.(csv|tsv|txt|xlsx|xls)$/i.test(filename)) throw new BadRequestError("Upload a .csv or .xlsx file.")

  let table: unknown[][]
  try {
    table = readTable(buf, filename)
  } catch (e) {
    if (e instanceof BadRequestError) throw e
    throw new BadRequestError("That file could not be read. Save it as CSV or Excel and try again.")
  }

  // the header row is the first one (within the top few) that has both a reviewer and a rating column
  const found = (row: unknown[], field: Field) => row.findIndex((c) => HEADERS[field].includes(norm(c)))
  const headerAt = table.slice(0, 5).findIndex((row) => found(row, "authorName") >= 0 && found(row, "rating") >= 0)
  if (headerAt < 0) throw new BadRequestError("No header row found. The first row must name the columns: Reviewer, Rating, Date, Review.")

  const header = table[headerAt]
  const at: Record<Field, number> = { authorName: found(header, "authorName"), rating: found(header, "rating"), date: found(header, "date"), text: found(header, "text") }
  // the review text is optional (a star rating can stand alone); the other columns are not
  if (at.date < 0) throw new BadRequestError(`The file has no "${COLUMN_NAME.date}" column.`)

  const rows: ImportRow[] = []
  const problems: ImportProblem[] = []
  let total = 0
  const latest = Date.now() + 36 * 3_600_000

  table.slice(headerAt + 1).forEach((cells, i) => {
    if (isBlank(cells)) return
    total++
    if (total > MAX_IMPORT_ROWS) return
    // the line number as the person sees it in Excel
    const row = headerAt + i + 2

    const authorName = shown(cells[at.authorName])
    const rating = parseRating(cells[at.rating])
    const date = parseReviewDate(cells[at.date])
    const text = at.text >= 0 ? shown(cells[at.text]) : ""

    const errors: string[] = []
    if (!authorName) errors.push("the reviewer name is empty")
    else if (authorName.length > MAX_AUTHOR_NAME) errors.push(`the reviewer name is over ${MAX_AUTHOR_NAME} characters`)
    if (rating === null) errors.push(`the rating "${shown(cells[at.rating])}" isn't a whole number from 1 to 5`)
    if (date === null) errors.push(shown(cells[at.date]) ? `the date "${shown(cells[at.date])}" isn't DD/MM/YYYY` : "the date is empty")
    else if (new Date(`${date}T12:00:00Z`).getTime() > latest) errors.push(`the date ${date} is in the future`)
    if (text.length > MAX_REVIEW_TEXT) errors.push(`the review text is over ${MAX_REVIEW_TEXT} characters`)

    if (errors.length) problems.push({ row, message: `${errors.join(", ")}.`.replace(/^./, (c) => c.toUpperCase()) })
    else rows.push({ row, authorName, rating: rating!, text, date: date! })
  })

  if (total === 0) throw new BadRequestError("The file has a header row but no reviews.")
  if (total > MAX_IMPORT_ROWS) throw new BadRequestError(`That file has ${total.toLocaleString("en-US")} reviews. Import up to ${MAX_IMPORT_ROWS} at a time.`)
  return { rows, problems, total }
}

/** Two rows are the same review when reviewer, day and text match, ignoring case and extra spaces. */
export const reviewKey = (authorName: string, date: string, text: string) => [authorName, date, text].map((v) => v.toLowerCase().replace(/\s+/g, " ").trim()).join("|")
