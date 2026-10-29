import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { handleError, readJson } from "@/lib/gbp-posts-api"
import { getProject, listProjects, toColumns } from "@/lib/proposals"
import { sanitizeProject, validateProject } from "@/lib/proposals-types"
import { getSession } from "@/lib/auth"

/** All projects, newest first. `?status=draft|sent|accepted|declined` filters. */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json({ projects: await listProjects(new URL(request.url).searchParams.get("status") ?? undefined) })
  } catch (error) {
    return handleError(error, "proposals")
  }
}

/** Create a project from the form, or copy an existing one with `{ duplicateOf: id }`. */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const b = await readJson(request)

    if (typeof b.duplicateOf === "string") {
      const source = await getProject(b.duplicateOf)
      if (!source) return NextResponse.json({ error: "That project no longer exists." }, { status: 404 })
      const row = await db.project.create({ data: { ...toColumns(source), name: `${source.name} (copy)`, proposal: source.proposal } })
      return NextResponse.json({ id: row.id }, { status: 201 })
    }

    const input = sanitizeProject(b)
    const errors = validateProject(input, ["clientName"])
    if (errors.clientName) throw new BadRequestError(errors.clientName)
    const row = await db.project.create({ data: toColumns(input) })
    return NextResponse.json({ id: row.id }, { status: 201 })
  } catch (error) {
    return handleError(error, "proposals")
  }
}
