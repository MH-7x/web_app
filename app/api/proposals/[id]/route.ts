import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { getProject, isStatus, toColumns } from "@/lib/proposals"
import { sanitizeProject, validateProject } from "@/lib/proposals-types"
import { getSession } from "@/lib/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Ctx) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const project = await getProject((await params).id)
    return project ? NextResponse.json({ project }) : fail("That project no longer exists.", 404)
  } catch (error) {
    return handleError(error, "proposals/get")
  }
}

/**
 * Save changes. Send the whole form (`clientName`, `pages`, prices...) to update the project details, and/or just
 * `status` or `proposal` (the edited proposal text). Fields that are not sent stay as they are.
 */
export async function PUT(request: Request, { params }: Ctx) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { id } = await params
    const existing = await getProject(id)
    if (!existing) return fail("That project no longer exists.", 404)
    const b = await readJson(request)
    const data: Record<string, unknown> = {}

    if ("clientName" in b) {
      const input = sanitizeProject(b)
      const errors = validateProject(input, ["clientName"])
      if (errors.clientName) throw new BadRequestError(errors.clientName)
      Object.assign(data, toColumns(input))
    }
    if ("status" in b) {
      if (!isStatus(b.status)) throw new BadRequestError("Unknown status.")
      data.status = b.status
    }
    if ("proposal" in b) {
      if (typeof b.proposal !== "string") throw new BadRequestError("The proposal must be text.")
      data.proposal = b.proposal.slice(0, 60_000)
    }

    await db.project.update({ where: { id }, data })
    return NextResponse.json({ project: await getProject(id) })
  } catch (error) {
    return handleError(error, "proposals/put")
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    await db.project.deleteMany({ where: { id: (await params).id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleError(error, "proposals/delete")
  }
}
