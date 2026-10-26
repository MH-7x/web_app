import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { fail, handleError } from "@/lib/gbp-posts-api"
import { generateProposal } from "@/lib/generators/proposals"
import { getProject } from "@/lib/proposals"
import { validateProject } from "@/lib/proposals-types"

export const maxDuration = 300

/** Write the proposal for a project with Gemini and save it on the project, replacing any earlier one. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const project = await getProject(id)
    if (!project) return fail("That project no longer exists.", 404)
    const problems = Object.values(validateProject(project))
    if (problems.length) throw new BadRequestError(`Finish the project first: ${problems.join(" ")}`)

    const proposal = await generateProposal(project)
    await db.project.update({ where: { id }, data: { proposal } })
    return NextResponse.json({ proposal })
  } catch (error) {
    return handleError(error, "proposals/generate")
  }
}
