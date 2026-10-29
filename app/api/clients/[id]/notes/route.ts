import { NextResponse } from "next/server"

import { parseNoteAction, parseNotes, updateNotes } from "@/lib/client-notes"
import { db } from "@/lib/db"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { getSession } from "@/lib/auth"

const NOT_FOUND = "That client no longer exists."

/** A client's quick notes, pinned first and then newest first. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { id } = await params
    const row = await db.client.findUnique({ where: { id }, select: { clientNotes: true } })
    if (!row) return fail(NOT_FOUND, 404)
    return NextResponse.json({ notes: parseNotes(row.clientNotes) })
  } catch (error) {
    return handleError(error, "notes/get")
  }
}

/** Add, pin (toggle) or delete a note: { action: "add", text } | { action: "pin", id } | { action: "delete", id }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { id } = await params
    const change = parseNoteAction(await readJson(request))
    const notes = await updateNotes(id, change)
    if (!notes) return fail(NOT_FOUND, 404)
    return NextResponse.json({ notes })
  } catch (error) {
    return handleError(error, "notes/post")
  }
}
