import Papa from "papaparse"
import * as XLSX from "xlsx"

import { BadRequestError } from "@/lib/content-types"
import { MAX_KEYWORDS_PER_GROUP, normalizeRows, type KeywordRow } from "@/lib/keywords-types"

/** Reads a Google Keyword Planner export (CSV, TSV or XLSX) into keyword rows. */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/** Header text with case, spaces and punctuation removed, so "Avg. monthly searches" and "avg monthly searches" match. */
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

const COLUMNS: Record<keyof KeywordRow, (h: string) => boolean> = {
  keyword: (h) => h === "keyword",
  avgMonthlySearches: (h) => h === "avgmonthlysearches" || h === "averagemonthlysearches",
  threeMonthChange: (h) => h === "threemonthchange",
  competition: (h) => h === "competition",
  topOfPageBidLow: (h) => h.startsWith("topofpagebidlow"),
  topOfPageBidHigh: (h) => h.startsWith("topofpagebidhigh"),
}

/** Keyword Planner saves UTF-16 tab-separated files with a byte-order mark; decode whatever encoding the file has. */
export function decodeText(buf: Buffer) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le")
  if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf.subarray(2)).swap16().toString("utf16le")
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8")
  return buf.toString("utf8")
}

/** "12,100" -> 12100. Free accounts get ranges like "1K – 10K"; the lower end is used. */
function parseCount(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase().replace(/,/g, "")
  const m = /^([\d.]+)\s*([km]?)/.exec(s)
  if (!m) return 0
  const n = Number.parseFloat(m[1]) * (m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1)
  return Number.isFinite(n) ? n : 0
}

function readSheet(buf: Buffer, filename: string): unknown[][] {
  if (/\.xlsx?$/i.test(filename)) {
    const book = XLSX.read(buf, { type: "buffer" })
    const sheet = book.Sheets[book.SheetNames[0]]
    if (!sheet) throw new BadRequestError("That spreadsheet has no sheets.")
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" })
  }
  return Papa.parse<string[]>(decodeText(buf), { skipEmptyLines: "greedy" }).data
}

export function parseKeywordFile(buf: Buffer, filename: string): { rows: KeywordRow[]; skipped: number } {
  if (buf.length === 0) throw new BadRequestError("That file is empty.")
  if (buf.length > MAX_UPLOAD_BYTES) throw new BadRequestError("That file is larger than 5 MB.")
  if (!/\.(csv|tsv|txt|xlsx|xls)$/i.test(filename)) throw new BadRequestError("Upload a .csv or .xlsx file.")

  let table: unknown[][]
  try {
    table = readSheet(buf, filename)
  } catch (e) {
    if (e instanceof BadRequestError) throw e
    throw new BadRequestError("That file could not be read. Export it from Keyword Planner as CSV or Excel.")
  }

  // Planner puts a title and a date-range line above the real header, so look for the row that has a Keyword column
  const headerAt = table.slice(0, 15).findIndex((row) => row.some((cell) => norm(cell) === "keyword"))
  if (headerAt < 0) throw new BadRequestError('No "Keyword" column found. Use a Google Keyword Planner export.')

  const headers = table[headerAt].map(norm)
  const at = Object.fromEntries((Object.keys(COLUMNS) as (keyof KeywordRow)[]).map((k) => [k, headers.findIndex(COLUMNS[k])])) as Record<keyof KeywordRow, number>
  const cell = (row: unknown[], k: keyof KeywordRow) => (at[k] >= 0 ? row[at[k]] : "")

  const raw = table.slice(headerAt + 1).map((row) => ({
    keyword: cell(row, "keyword"),
    avgMonthlySearches: parseCount(cell(row, "avgMonthlySearches")),
    threeMonthChange: cell(row, "threeMonthChange"),
    competition: cell(row, "competition"),
    topOfPageBidLow: String(cell(row, "topOfPageBidLow") ?? "").replace(/,/g, ""),
    topOfPageBidHigh: String(cell(row, "topOfPageBidHigh") ?? "").replace(/,/g, ""),
  }))

  const rows = normalizeRows(raw)
  if (rows.length === 0) throw new BadRequestError("No keywords were found in that file.")
  if (rows.length > MAX_KEYWORDS_PER_GROUP) throw new BadRequestError(`That file has more than ${MAX_KEYWORDS_PER_GROUP.toLocaleString()} keywords. Split it up.`)
  return { rows, skipped: raw.length - rows.length }
}
