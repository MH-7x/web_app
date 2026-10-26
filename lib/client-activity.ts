import type { ActivityItem } from "@/lib/client-activity-types"
import { asRecord } from "@/lib/client-schema"
import { CONTENT_TYPES } from "@/lib/constants"
import { db } from "@/lib/db"
import { dateKey } from "@/lib/gbp-posts-types"

/** How many rows to read from each table; the timeline is a recent-history view, not an archive. */
const PER_SOURCE = 200

const ADS_TYPES = new Set(["fb-ad", "rsa"])

const GENERATED: Record<string, string> = {
  gbp: "GBP description generated",
  faq: "FAQ items generated",
  blog: "Blog post generated",
  meta: "Meta tags generated",
  landing: "Landing page saved",
  rsa: "Google RSA copy generated",
  "fb-ad": "Facebook ad copy generated",
  humanized: "Text humanized",
  report: "Monthly report generated",
}

const LANGUAGES: Record<string, string> = { en: "English", ar: "Arabic", both: "English + Arabic" }

const monthName = (key: string) => {
  const [y, m] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })
}

/** Everything the dashboard has done for one client, newest first. Reads existing tables only. */
export async function getClientActivity(clientId: string): Promise<ActivityItem[]> {
  const [content, audits, posts] = await Promise.all([
    db.generatedContent.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, type: true, subtype: true, language: true, humanized: true, createdAt: true },
    }),
    db.audit.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: PER_SOURCE, select: { id: true, url: true, scores: true, createdAt: true } }),
    db.gBPPost.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE * 3,
      select: { id: true, scheduledDate: true, category: true, status: true, publishedAt: true, createdAt: true },
    }),
  ])

  const items: ActivityItem[] = []

  for (const row of content) {
    const ads = ADS_TYPES.has(row.type)
    const what = GENERATED[row.type] ?? `${CONTENT_TYPES[row.type]?.label ?? row.type} generated`
    const language = LANGUAGES[row.language]
    items.push({
      id: `content-${row.id}`,
      type: ads ? "ads" : "content",
      subtype: row.type,
      description: `${what}${row.subtype ? ` for ${row.subtype}` : ""}${language ? ` (${language})` : ""}`,
      date: row.createdAt.toISOString(),
      linkTo: ads ? "/ads" : `/clients/${clientId}?tab=history&type=${encodeURIComponent(row.type)}`,
      metadata: { contentId: row.id, language: row.language, humanized: row.humanized },
    })
  }

  for (const row of audits) {
    const scores = asRecord(row.scores)
    const overall = typeof scores.overall === "number" ? scores.overall : null
    const grade = typeof scores.grade === "string" ? scores.grade : null
    items.push({
      id: `audit-${row.id}`,
      type: "audit",
      subtype: null,
      description: overall === null ? "SEO audit completed" : `SEO audit completed — ${overall}/100${grade ? ` (${grade})` : ""}`,
      date: row.createdAt.toISOString(),
      linkTo: `/seo?audit=${encodeURIComponent(row.id)}`,
      metadata: { auditId: row.id, url: row.url, overall, grade },
    })
  }

  // a month of posts is created in one go, so group each batch (same creation day and target month) into one entry
  const batches = new Map<string, { month: string; count: number; date: Date }>()
  for (const post of posts) {
    const month = dateKey(post.scheduledDate).slice(0, 7)
    const key = `${dateKey(post.createdAt)}|${month}`
    const batch = batches.get(key)
    if (batch) {
      batch.count++
      if (post.createdAt > batch.date) batch.date = post.createdAt
    } else {
      batches.set(key, { month, count: 1, date: post.createdAt })
    }

    if (post.publishedAt) {
      items.push({
        id: `gbp-published-${post.id}`,
        type: "gbp",
        subtype: "published",
        description: `GBP post published (${post.category.replace(/-/g, " ")})`,
        date: post.publishedAt.toISOString(),
        linkTo: `/gbp-posts?month=${month}`,
        metadata: { postId: post.id, category: post.category },
      })
    }
  }
  for (const [key, batch] of batches) {
    items.push({
      id: `gbp-batch-${key}`,
      type: "gbp",
      subtype: "generated",
      description: `${batch.count} GBP ${batch.count === 1 ? "post" : "posts"} generated for ${monthName(batch.month)}`,
      date: batch.date.toISOString(),
      linkTo: `/gbp-posts?month=${batch.month}`,
      metadata: { count: batch.count, month: batch.month },
    })
  }

  return items.sort((a, b) => b.date.localeCompare(a.date))
}
