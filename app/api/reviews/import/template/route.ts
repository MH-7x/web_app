import { IMPORT_HEADERS } from "@/lib/reviews-types"

const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** A ready-to-fill CSV with the four columns and two example rows (one Arabic). The BOM makes Excel read the Arabic correctly. */
export function GET() {
  const rows = [
    IMPORT_HEADERS as readonly string[],
    ["Omar Khalid", "5", "28/10/2026", "Great service, on time and careful with the furniture."],
    ["سارة أحمد", "4", "15/10/2026", "خدمة ممتازة وفريق محترف"],
  ]
  const csv = `﻿${rows.map((r) => r.map(quote).join(",")).join("\r\n")}\r\n`
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="reviews-template.csv"', "Cache-Control": "no-store" },
  })
}
