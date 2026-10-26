import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import type { KeywordGroup } from "@/lib/generated/prisma/client"
import { normalizeRows, type KeywordGroupData, type KeywordGroupSummary, type KeywordRow } from "@/lib/keywords-types"

/** Stored JSON text -> rows; a damaged value reads as an empty group rather than crashing the page. */
export function parseStoredKeywords(raw: string): KeywordRow[] {
  try {
    return normalizeRows(JSON.parse(raw))
  } catch {
    return []
  }
}

export const toData = (row: KeywordGroup): KeywordGroupData => ({
  id: row.id,
  name: row.name,
  clientId: row.clientId,
  updatedAt: row.updatedAt.toISOString(),
  keywords: parseStoredKeywords(row.keywords),
})

export async function listKeywordGroups(): Promise<KeywordGroupSummary[]> {
  const rows = await db.keywordGroup.findMany({ orderBy: { name: "asc" } })
  return rows.map((r) => ({ id: r.id, name: r.name, clientId: r.clientId, updatedAt: r.updatedAt.toISOString(), count: parseStoredKeywords(r.keywords).length }))
}

export async function getKeywordGroup(id: string) {
  const row = await db.keywordGroup.findUnique({ where: { id } })
  return row ? toData(row) : null
}

export const summarize = (g: KeywordGroupData): KeywordGroupSummary => ({ id: g.id, name: g.name, clientId: g.clientId, updatedAt: g.updatedAt, count: g.keywords.length })

export const cleanName = (v: unknown) => {
  const name = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : ""
  if (!name) throw new BadRequestError("Give the group a name.")
  if (name.length > 80) throw new BadRequestError("Keep the group name under 80 characters.")
  return name
}

/** null/empty = shared across all clients; otherwise the client must exist. */
export async function cleanClientId(v: unknown) {
  if (v === null || v === undefined || v === "") return null
  if (typeof v !== "string") throw new BadRequestError("Choose a client from the list.")
  if (!(await db.client.findUnique({ where: { id: v }, select: { id: true } }))) throw new BadRequestError("That client no longer exists.")
  return v
}
