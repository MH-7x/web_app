import { NextResponse } from "next/server"

import { ensureChecklist, parseChecklistChange, updateChecklist, type ChecklistChange } from "@/lib/onboarding-checklist"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"

const NOT_FOUND = "That client no longer exists."

async function apply(request: Request, params: Promise<{ id: string }>, action: ChecklistChange["action"]) {
  const { id } = await params
  const items = await updateChecklist(id, parseChecklistChange(await readJson(request), action))
  return items ? NextResponse.json({ items }) : fail(NOT_FOUND, 404)
}

/** The client's onboarding checklist. A client that has none yet gets its category's default list. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const items = await ensureChecklist(id)
    return items ? NextResponse.json({ items }) : fail(NOT_FOUND, 404)
  } catch (error) {
    return handleError(error, "checklist/get")
  }
}

/** Tick or untick a task: { id, checked }. The completion date is recorded when it is ticked. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await apply(request, params, "toggle")
  } catch (error) {
    return handleError(error, "checklist/put")
  }
}

/** Add a custom task: { label, section }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await apply(request, params, "add")
  } catch (error) {
    return handleError(error, "checklist/post")
  }
}

/** Remove a custom task: { id }. The default tasks can't be removed. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await apply(request, params, "remove")
  } catch (error) {
    return handleError(error, "checklist/delete")
  }
}
