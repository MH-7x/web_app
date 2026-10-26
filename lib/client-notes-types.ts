export type QuickNote = { id: string; text: string; pinned: boolean; createdAt: string }

export const MAX_NOTES = 50
export const MAX_NOTE_LENGTH = 2000

/** Pinned notes first, then newest first. */
export function sortNotes(notes: QuickNote[]) {
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))
}
