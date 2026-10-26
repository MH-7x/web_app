import { NextResponse } from "next/server"

import { handleError } from "@/lib/gbp-posts-api"
import { generateText, getModelName } from "@/lib/gemini"

/** One tiny request to confirm the saved key works with the configured model. */
export async function POST() {
  try {
    await generateText("Reply with the single word OK.", { temperature: 0 })
    return NextResponse.json({ ok: true, model: getModelName() })
  } catch (error) {
    return handleError(error, "settings/api-keys/test")
  }
}
