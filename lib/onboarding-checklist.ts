import { asRecord } from "@/lib/client-schema"
import { DEFAULT_CATEGORY, isCategory } from "@/lib/constants"
import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import {
  MAX_ITEMS,
  MAX_ITEM_LABEL,
  isChecklistSection,
  type ChecklistItem,
} from "@/lib/onboarding-checklist-types"
import { getDefaultChecklist } from "@/lib/onboarding-templates"

/** Stored JSON string -> items, dropping anything malformed. */
export function parseChecklist(raw: unknown): ChecklistItem[] {
  let value: unknown = raw
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value.flatMap((v): ChecklistItem[] => {
    const r = asRecord(v)
    if (typeof r.id !== "string" || typeof r.label !== "string" || !r.label.trim() || !isChecklistSection(r.section)) return []
    const checked = r.checked === true
    return [{ id: r.id, label: r.label, section: r.section, checked, checkedAt: checked && typeof r.checkedAt === "string" ? r.checkedAt : null, isCustom: r.isCustom === true }]
  })
}

/** Fill in the category's default checklist for a client that has none yet. Defaults can't be deleted, so empty means never seeded. */
export async function ensureChecklist(clientId: string) {
  return mutateChecklist(clientId, (items) => items)
}

/** The checklist rows of the given clients, seeding the ones that have none. */
export async function seedChecklists(rows: { id: string; category: string; onboardingChecklist: string }[]) {
  return new Map(
    await Promise.all(
      rows.map(async (row): Promise<[string, ChecklistItem[]]> => {
        const items = parseChecklist(row.onboardingChecklist)
        if (items.length) return [row.id, items]
        return [row.id, (await ensureChecklist(row.id)) ?? []]
      })
    )
  )
}

export type ChecklistChange =
  | { action: "toggle"; id: string; checked: boolean }
  | { action: "add"; label: string; section: ChecklistItem["section"] }
  | { action: "remove"; id: string }

export function parseChecklistChange(body: Record<string, unknown>, action: ChecklistChange["action"]): ChecklistChange {
  if (action === "add") {
    const label = typeof body.label === "string" ? body.label.trim().replace(/\s+/g, " ") : ""
    if (!label) throw new BadRequestError("Enter a name for the task.")
    if (label.length > MAX_ITEM_LABEL) throw new BadRequestError(`Task names can be up to ${MAX_ITEM_LABEL} characters.`)
    if (!isChecklistSection(body.section)) throw new BadRequestError("Choose a section for the task.")
    return { action, label, section: body.section }
  }
  if (typeof body.id !== "string" || !body.id) throw new BadRequestError("Say which task you mean.")
  if (action === "toggle") {
    if (typeof body.checked !== "boolean") throw new BadRequestError("`checked` must be true or false.")
    return { action, id: body.id, checked: body.checked }
  }
  return { action, id: body.id }
}

/** Apply one change to a client's checklist. Returns the new list, or null when the client doesn't exist. */
export async function updateChecklist(clientId: string, change: ChecklistChange) {
  return mutateChecklist(clientId, (items) => {
    if (change.action === "toggle") {
      if (!items.some((i) => i.id === change.id)) throw new BadRequestError("That task no longer exists.")
      return items.map((i) => (i.id !== change.id ? i : { ...i, checked: change.checked, checkedAt: change.checked ? (i.checkedAt ?? new Date().toISOString()) : null }))
    }
    if (change.action === "add") {
      if (items.length >= MAX_ITEMS) throw new BadRequestError(`A checklist can have up to ${MAX_ITEMS} tasks.`)
      return [...items, { id: crypto.randomUUID(), label: change.label, section: change.section, checked: false, checkedAt: null, isCustom: true }]
    }
    const target = items.find((i) => i.id === change.id)
    if (!target) throw new BadRequestError("That task no longer exists.")
    if (!target.isCustom) throw new BadRequestError("Only custom tasks can be removed.")
    return items.filter((i) => i.id !== change.id)
  })
}

async function mutateChecklist(clientId: string, apply: (items: ChecklistItem[]) => ChecklistItem[]) {
  return db.$transaction(async (tx) => {
    const row = await tx.client.findUnique({ where: { id: clientId }, select: { category: true, onboardingChecklist: true } })
    if (!row) return null
    let items = parseChecklist(row.onboardingChecklist)
    const seeded = items.length > 0
    if (!seeded) items = getDefaultChecklist(isCategory(row.category) ? row.category : DEFAULT_CATEGORY)
    const next = apply(items)
    if (!seeded || next !== items) await tx.client.update({ where: { id: clientId }, data: { onboardingChecklist: JSON.stringify(next) } })
    return next
  })
}
