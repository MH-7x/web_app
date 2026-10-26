import { NextResponse } from "next/server"

import { fail, handleError } from "@/lib/gbp-posts-api"
import { convertToClient, getProject } from "@/lib/proposals"

/** Create a client from a project. A project that was already converted returns its client instead of making a second one. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const project = await getProject((await params).id)
    if (!project) return fail("That project no longer exists.", 404)
    if (project.clientId) return NextResponse.json({ clientId: project.clientId, created: false })
    const client = await convertToClient(project)
    return NextResponse.json({ clientId: client.id, created: true }, { status: 201 })
  } catch (error) {
    return handleError(error, "proposals/convert")
  }
}
