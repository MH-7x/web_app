import { NextResponse } from "next/server"

import { maskSecret, saveGeminiApiKey } from "@/lib/app-config"
import { BadRequestError } from "@/lib/content-types"
import { handleError, readJson } from "@/lib/gbp-posts-api"
import { getSession } from "@/lib/auth"

/** Save the Gemini API key, encrypted, in the database. The key is never sent back, only a masked form. */
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const b = await readJson(request)
    const key = typeof b.key === "string" ? b.key.trim() : ""
    if (!key) throw new BadRequestError("Paste the new key.")
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(key)) throw new BadRequestError("That does not look like a Gemini API key. It should be 20 or more letters, numbers, dashes or underscores, with no spaces.")
    await saveGeminiApiKey(key)
    return NextResponse.json({ masked: maskSecret(key) })
  } catch (error) {
    return handleError(error, "settings/api-keys")
  }
}
