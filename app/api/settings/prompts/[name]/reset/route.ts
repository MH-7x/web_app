import { NextResponse } from "next/server"

import { fail, handleError } from "@/lib/gbp-posts-api"
import { resetTemplate } from "@/lib/prompts/store"
import { getDef, type TemplateName } from "@/lib/prompts/templates"
import { getSession } from "@/lib/auth"

/** Put a template back to the built-in default. */
export async function POST(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { name } = await params
    if (!getDef(name)) return fail("Unknown prompt template.", 404)
    return NextResponse.json({ template: await resetTemplate(name as TemplateName) })
  } catch (error) {
    return handleError(error, "settings/prompts/reset")
  }
}
