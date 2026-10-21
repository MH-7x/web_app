import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { runSample } from "@/lib/prompts/sample-run"
import { withTemplateDraft } from "@/lib/prompts/store"
import { examplesProblem, getDef, templateProblems, type TemplateName } from "@/lib/prompts/templates"

export const maxDuration = 300

/** Run the real generator against a made-up client using the draft in the editor (saved or not). Nothing is stored. */
export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params
    const def = getDef(name)
    if (!def) return fail("Unknown prompt template.", 404)

    const b = await readJson(request)
    const systemPrompt = typeof b.systemPrompt === "string" ? b.systemPrompt.replace(/\r\n/g, "\n").trim() : ""
    const problems = templateProblems(systemPrompt, def)
    if (problems.length) throw new BadRequestError(problems.join(" "))
    const examples = b.examples === undefined ? [] : b.examples
    const bad = examplesProblem(examples)
    if (bad) throw new BadRequestError(`Few-shot examples: ${bad}`)

    const output = await withTemplateDraft(name as TemplateName, { systemPrompt, examples }, () => runSample(name as TemplateName))
    return NextResponse.json({ output })
  } catch (error) {
    return handleError(error, "settings/prompts/test")
  }
}
