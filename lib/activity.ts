import { CONTENT_TYPES } from "@/lib/constants"
import { db } from "@/lib/db"

export type ActivityItem = {
  id: string
  kind: "content" | "gbp-posts" | "audit"
  clientId: string
  clientName: string
  /** badge text, e.g. "GBP Description" */
  label: string
  summary: string
  createdAt: Date
  href: string
}

const clip = (text: string, n = 140) => {
  const flat = text.replace(/[#*_`>]+/g, "").replace(/\s+/g, " ").trim()
  return flat.length > n ? `${flat.slice(0, n).trimEnd()}…` : flat
}

const asNumber = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

/**
 * The latest things made across every client: generated content, GBP posts (a batch written together counts as one
 * item) and SEO audits. Newest first.
 */
export async function getRecentActivity(limit = 10): Promise<ActivityItem[]> {
  const [content, posts, audits] = await Promise.all([
    db.generatedContent.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { client: { select: { id: true, name: true } } } }),
    // a month of posts is 12 rows, so look further back and fold them into batches below
    db.gBPPost.findMany({ orderBy: { createdAt: "desc" }, take: limit * 12, include: { client: { select: { id: true, name: true } } } }),
    db.audit.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { client: { select: { id: true, name: true } } } }),
  ])

  const items: ActivityItem[] = content.map((c) => ({
    id: `content-${c.id}`,
    kind: "content",
    clientId: c.client.id,
    clientName: c.client.name,
    label: CONTENT_TYPES[c.type]?.label ?? c.type,
    summary: clip(c.subtype ? `${c.subtype}: ${c.content}` : c.content),
    createdAt: c.createdAt,
    href: `/clients/${c.client.id}?tab=history`,
  }))

  const batches = new Map<string, { first: (typeof posts)[number]; count: number }>()
  for (const p of posts) {
    const key = `${p.clientId}-${p.createdAt.toISOString().slice(0, 16)}` // same client, same minute
    const batch = batches.get(key)
    if (batch) batch.count++
    else batches.set(key, { first: p, count: 1 })
  }
  for (const [key, { first, count }] of batches) {
    items.push({
      id: `posts-${key}`,
      kind: "gbp-posts",
      clientId: first.client.id,
      clientName: first.client.name,
      label: "GBP Posts",
      summary: `${count} ${count === 1 ? "post" : "posts"} drafted for the calendar`,
      createdAt: first.createdAt,
      href: `/clients/${first.client.id}`,
    })
  }

  for (const a of audits) {
    const overall = asNumber((a.scores as Record<string, unknown> | null)?.overall)
    items.push({
      id: `audit-${a.id}`,
      kind: "audit",
      clientId: a.client.id,
      clientName: a.client.name,
      label: "SEO Audit",
      summary: `${overall !== null ? `Score ${Math.round(overall)}/100 · ` : ""}${a.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
      createdAt: a.createdAt,
      href: `/clients/${a.client.id}`,
    })
  }

  return items.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime()).slice(0, limit)
}
