import { NextResponse } from "next/server"

import { setEnvValue, maskSecret } from "@/lib/env-file"
import { BadRequestError } from "@/lib/content-types"
import { handleError, readJson } from "@/lib/gbp-posts-api"
import { getSession } from "@/lib/auth"

/** Update GEMINI_API_KEY: written back to .env and applied to the running server. The key is never sent back, only a masked form. */
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
    try {
      await setEnvValue("GEMINI_API_KEY", key)
    } catch (e) {
      console.error("[settings/api-keys]", e)
      throw new BadRequestError("Could not write to the .env file. Check that it is not read-only.")
    }
    return NextResponse.json({ masked: maskSecret(key) })
  } catch (error) {
    return handleError(error, "settings/api-keys")
  }
}
