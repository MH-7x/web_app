import { BadRequestError, CONTENT_MODULE_TYPES, resultFromMetadata, toColumns, type ContentType } from "@/lib/content-types"
import { db } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import { applyUnits, unitsOf, type Strictness } from "@/lib/humanizer-types"
import { isMostlyArabic } from "@/lib/humanizer-patterns"

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

export const BATCH_LIMIT = 40

export type BatchItem = {
  rowId: string
  type: ContentType
  key: string
  label: string
  text: string
  /** the rewrite has already been approved into the saved content */
  approved: boolean
}

/** Every humanizable piece of a client's saved content, newest first. */
export async function listBatchItems(clientId: string, type: ContentType | "all"): Promise<{ items: BatchItem[]; rows: number }> {
  const rows = await db.generatedContent.findMany({
    where: { clientId, type: type === "all" ? { in: CONTENT_MODULE_TYPES } : type },
    orderBy: { createdAt: "desc" },
    take: BATCH_LIMIT,
  })
  const items: BatchItem[] = []
  let used = 0
  for (const row of rows) {
    const t = row.type as ContentType
    const result = resultFromMetadata(t, row.metadata)
    if (!result) continue
    const done = asObject(asObject(asObject(row.metadata).humanizer).units)
    const units = unitsOf(t, result)
    if (!units.length) continue
    used++
    for (const u of units) items.push({ rowId: row.id, type: t, key: u.key, label: u.label, text: u.text, approved: u.key in done })
  }
  return { items, rows: used }
}

export type Approval = { key: string; text: string; afterScore: number }

/** Write approved rewrites into a saved piece so Content History shows the humanized text. */
export async function approveUnits(rowId: string, approvals: Approval[]) {
  const row = await db.generatedContent.findUnique({ where: { id: rowId } })
  if (!row || !(CONTENT_MODULE_TYPES as string[]).includes(row.type)) throw new BadRequestError("That item no longer exists.")
  const type = row.type as ContentType
  const result = resultFromMetadata(type, row.metadata)
  if (!result) throw new BadRequestError("That item cannot be humanized.")

  const valid = new Set(unitsOf(type, result).map((u) => u.key))
  const accepted = approvals.filter((a) => valid.has(a.key) && a.text.trim())
  if (!accepted.length) throw new BadRequestError("Nothing to approve: the content changed since it was processed.")

  const next = applyUnits(type, result, Object.fromEntries(accepted.map((a) => [a.key, a.text.trim()])))
  const meta = asObject(row.metadata)
  const scores = { ...asObject(asObject(meta.humanizer).units) } as Record<string, { score: number }>
  for (const a of accepted) scores[a.key] = { score: a.afterScore }

  const all = unitsOf(type, next).map((u) => u.key)
  const complete = all.every((k) => k in scores)
  const mean = Object.values(scores).reduce((s, v) => s + v.score, 0) / Object.keys(scores).length

  await db.generatedContent.update({
    where: { id: rowId },
    data: {
      ...toColumns(type, next),
      metadata: { ...meta, result: next, humanizer: { units: scores } } as unknown as Prisma.InputJsonValue,
      humanized: complete,
      score: Math.round(mean),
    },
  })
  return { approved: accepted.map((a) => a.key), complete }
}

/** Save pasted text and its rewrite to a client's history. */
export async function savePaste(input: { clientId: string; original: string; humanized: string; strictness: Strictness; beforeScore: number; afterScore: number }) {
  const row = await db.generatedContent.create({
    data: {
      clientId: input.clientId,
      type: "humanized",
      subtype: `${input.strictness[0].toUpperCase()}${input.strictness.slice(1)} rewrite`,
      language: isMostlyArabic(input.humanized) ? "ar" : "en",
      content: input.humanized,
      humanized: true,
      score: input.afterScore,
      metadata: { original: input.original, strictness: input.strictness, beforeScore: input.beforeScore, afterScore: input.afterScore },
    },
  })
  return row.id
}
