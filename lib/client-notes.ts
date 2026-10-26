import { MAX_NOTES, MAX_NOTE_LENGTH, sortNotes, type QuickNote } from "@/lib/client-notes-types"
import { asRecord } from "@/lib/client-schema"
import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"

/** Stored JSON string -> sorted notes, dropping anything malformed. */
export function parseNotes(raw: unknown): QuickNote[] {
  let value: unknown = raw
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return sortNotes(
    value.flatMap((v) => {
      const r = asRecord(v)
      if (typeof r.id !== "string" || typeof r.text !== "string" || !r.text.trim() || typeof r.createdAt !== "string") return []
      return [{ id: r.id, text: r.text, pinned: r.pinned === true, createdAt: r.createdAt }]
    })
  )
}

export type NoteAction = { action: "add"; text: string } | { action: "pin"; id: string } | { action: "delete"; id: string }

/** Read and validate the body of the notes POST. */
export function parseNoteAction(body: Record<string, unknown>): NoteAction {
  if (body.action === "add") {
    const text = typeof body.text === "string" ? body.text.trim() : ""
    if (!text) throw new BadRequestError("Write something before adding a note.")
    if (text.length > MAX_NOTE_LENGTH) throw new BadRequestError(`Notes can be up to ${MAX_NOTE_LENGTH} characters.`)
    return { action: "add", text }
  }
  if ((body.action === "pin" || body.action === "delete") && typeof body.id === "string" && body.id) {
    return { action: body.action, id: body.id }
  }
  throw new BadRequestError("Unknown note action.")
}

/** Apply one change to a client's notes. Returns null when the client doesn't exist. */
export async function updateNotes(clientId: string, change: NoteAction) {
  return db.$transaction(async (tx) => {
    const row = await tx.client.findUnique({ where: { id: clientId }, select: { clientNotes: true } })
    if (!row) return null
    let notes = parseNotes(row.clientNotes)

    if (change.action === "add") {
      if (notes.length >= MAX_NOTES) throw new BadRequestError(`A client can have up to ${MAX_NOTES} notes. Delete one to add another.`)
      notes.push({ id: crypto.randomUUID(), text: change.text, pinned: false, createdAt: new Date().toISOString() })
    } else if (change.action === "pin") {
      notes = notes.map((n) => (n.id === change.id ? { ...n, pinned: !n.pinned } : n))
    } else {
      notes = notes.filter((n) => n.id !== change.id)
    }

    notes = sortNotes(notes)
    await tx.client.update({ where: { id: clientId }, data: { clientNotes: JSON.stringify(notes) } })
    return notes
  })
}
