import { NextResponse } from "next/server"

import { handleError, readJson } from "@/lib/gbp-posts-api"
import { humanizePaste } from "@/lib/generators/humanizer"
import { parseHumanizeRequest } from "@/lib/humanizer-types"

/** Humanize pasted text and score it before and after. Nothing is saved. */
export async function POST(request: Request) {
  try {
    const { text, strictness } = parseHumanizeRequest(await readJson(request))
    const out = await humanizePaste(text, strictness)
    return NextResponse.json({ humanized: out.after, beforeScore: out.beforeScore, afterScore: out.afterScore, warnings: out.warnings })
  } catch (error) {
    return handleError(error, "humanizer/process")
  }
}
