import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { saveTemplate } from "@/lib/prompts/store"
import { examplesProblem, getDef, templateProblems, type TemplateName } from "@/lib/prompts/templates"
import { getSession } from "@/lib/auth"

/** Save an edited prompt template. Generators read it on their next run. */
export async function PUT(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { name } = await params
    const def = getDef(name)
    if (!def) return fail("Unknown prompt template.", 404)

    const b = await readJson(request)
    const systemPrompt = typeof b.systemPrompt === "string" ? b.systemPrompt.replace(/\r\n/g, "\n").trim() : ""
    if (systemPrompt.length > 40000) throw new BadRequestError("That prompt is too long (limit 40,000 characters).")
    const problems = templateProblems(systemPrompt, def)
    if (problems.length) throw new BadRequestError(problems.join(" "))

    const examples = b.examples === undefined ? [] : b.examples
    const bad = examplesProblem(examples)
    if (bad) throw new BadRequestError(`Few-shot examples: ${bad}`)
    if (JSON.stringify(examples).length > 100000) throw new BadRequestError("The few-shot examples are too long.")

    return NextResponse.json({ template: await saveTemplate(name as TemplateName, systemPrompt, examples) })
  } catch (error) {
    return handleError(error, "settings/prompts")
  }
}
