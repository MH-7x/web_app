import { asStringArray } from "@/lib/client-schema"
import { db } from "@/lib/db"
import type { GBPPost } from "@/lib/generated/prisma/client"
import { dateKey, monthRange, toStoredDate, type PostDTO } from "@/lib/gbp-posts-types"

export function toPostDTO(row: GBPPost): PostDTO {
  return {
    id: row.id,
    date: dateKey(row.scheduledDate),
    category: row.category,
    postType: row.postType,
    cta: row.cta,
    status: row.status,
    language: row.language === "en" || row.language === "ar" ? row.language : "both",
    textAr: row.textAr,
    textEn: row.textEn,
    keywords: asStringArray(row.keywords),
    imagePrompt: row.imagePrompt ?? "",
    imageUrl: row.imageUrl,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    gbpPostId: row.gbpPostId,
  }
}

/** Posts scheduled in a month (YYYY-MM), by Dubai calendar day. */
export async function listPostsForMonth(clientId: string, month: string) {
  const { start, end } = monthRange(month)
  const rows = await db.gBPPost.findMany({
    where: { clientId, scheduledDate: { gte: toStoredDate(start), lt: toStoredDate(end) } },
    orderBy: { scheduledDate: "asc" },
  })
  return rows.map(toPostDTO)
}

/** Every business, with what the post wizard needs to suggest keywords. */
export async function listWizardClients() {
  const rows = await db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, emirate: true, services: true, areas: true } })
  return rows.map((c) => ({ id: c.id, name: c.name, emirate: c.emirate, services: asStringArray(c.services), areas: asStringArray(c.areas) }))
}
