export const CHECKLIST_SECTIONS = ["Google Properties", "Social Media", "Website", "Initial Content", "Client Assets"] as const
export type ChecklistSection = (typeof CHECKLIST_SECTIONS)[number]

export const isChecklistSection = (value: unknown): value is ChecklistSection => (CHECKLIST_SECTIONS as readonly unknown[]).includes(value)

export type ChecklistItem = {
  id: string
  label: string
  section: ChecklistSection
  checked: boolean
  /** ISO timestamp of when it was ticked, null while open */
  checkedAt: string | null
  /** added by hand rather than part of the category's default list */
  isCustom: boolean
}

export const MAX_ITEM_LABEL = 120
export const MAX_ITEMS = 150

export type ChecklistProgress = { done: number; total: number; percent: number }

export function checklistProgress(items: ChecklistItem[]): ChecklistProgress {
  const done = items.filter((i) => i.checked).length
  return { done, total: items.length, percent: items.length ? Math.round((done / items.length) * 100) : 0 }
}
