import ExcelJS from "exceljs"

import { getClient } from "@/lib/clients"
import { listPostsForMonth } from "@/lib/gbp-posts"
import { fail } from "@/lib/gbp-posts-api"
import { CTAS, POST_TYPES, isMonthKey, monthLabel } from "@/lib/gbp-posts-types"

/** XLSX of the month's approved posts: Date, Text AR, Text EN, Post Type, CTA, Image Prompt. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get("clientId") ?? ""
  const month = searchParams.get("month") ?? ""
  if (!isMonthKey(month)) return fail("Invalid month.", 400)
  const client = clientId ? await getClient(clientId) : null
  if (!client) return fail("That client no longer exists.", 404)

  const posts = (await listPostsForMonth(client.id, month)).filter((p) => p.status !== "draft")

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(monthLabel(month).slice(0, 31))
  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Text AR", key: "ar", width: 70 },
    { header: "Text EN", key: "en", width: 70 },
    { header: "Post Type", key: "type", width: 12 },
    { header: "CTA", key: "cta", width: 12 },
    { header: "Image Prompt", key: "image", width: 70 },
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: "frozen", ySplit: 1, rightToLeft: false }]
  for (const p of posts) {
    const row = sheet.addRow({ date: p.date, ar: p.textAr, en: p.textEn, type: POST_TYPES[p.postType] ?? p.postType, cta: CTAS[p.cta]?.label ?? p.cta, image: p.imagePrompt })
    row.alignment = { vertical: "top", wrapText: true }
    row.getCell("ar").alignment = { vertical: "top", wrapText: true, readingOrder: "rtl" }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${client.slug}-gbp-posts-${month}.xlsx"`,
    },
  })
}
