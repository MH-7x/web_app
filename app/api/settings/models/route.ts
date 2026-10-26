import { NextResponse } from "next/server"

import { setEnvValue } from "@/lib/env-file"
import { BadRequestError } from "@/lib/content-types"
import { handleError, readJson } from "@/lib/gbp-posts-api"
import { getModelName } from "@/lib/gemini"

export type GeminiModelInfo = {
  /** Id to put in GEMINI_MODEL, e.g. gemini-2.5-pro */
  name: string
  displayName: string
  description: string
  supportedGenerationMethods: string[]
  inputTokenLimit: number | null
}

/**
 * The dashboard only does text generation, including JSON-schema output (content, ads, GBP posts, reports, humanizer).
 * Keep general Gemini text models; drop image, audio/speech, live, embedding, agent and other specialised variants.
 */
const SUITABLE = /^gemini-/
const UNSUITABLE = /image|imagen|tts|audio|live|embedding|robotics|computer-use|veo|vision|learnlm|aqa|dialog/i

type RawModel = {
  name?: string
  displayName?: string
  description?: string
  supportedGenerationMethods?: string[]
  inputTokenLimit?: number
}

const INVALID_KEY = "Invalid API key — set a valid Gemini API key first."

/** Models the saved API key can use for generateContent, plus the one currently active. */
export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new BadRequestError(INVALID_KEY)

    let res: Response
    try {
      res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
        headers: { "x-goog-api-key": apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      return NextResponse.json({ error: "Could not reach Gemini. Check your connection and try again." }, { status: 503 })
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) throw new BadRequestError(INVALID_KEY)
    if (!res.ok) return NextResponse.json({ error: `Gemini could not list models (${res.status}).` }, { status: 502 })

    const body = (await res.json().catch(() => null)) as { models?: RawModel[] } | null
    const models: GeminiModelInfo[] = (body?.models ?? [])
      .filter((m) => m.name && m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => {
        const name = m.name!.replace(/^models\//, "")
        return {
          name,
          displayName: m.displayName || name,
          description: m.description ?? "",
          supportedGenerationMethods: m.supportedGenerationMethods ?? [],
          inputTokenLimit: m.inputTokenLimit ?? null,
        }
      })
      .filter((m) => SUITABLE.test(m.name) && !UNSUITABLE.test(m.name))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ models, current: getModelName() })
  } catch (error) {
    return handleError(error, "settings/models")
  }
}

/** Save the chosen model as GEMINI_MODEL; applies to the running server immediately. */
export async function POST(request: Request) {
  try {
    const b = await readJson(request)
    const model = typeof b.model === "string" ? b.model.trim().replace(/^models\//, "") : ""
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(model)) throw new BadRequestError("That is not a valid model name.")
    try {
      await setEnvValue("GEMINI_MODEL", model)
    } catch (e) {
      console.error("[settings/models]", e)
      throw new BadRequestError("Could not write to the .env file. Check that it is not read-only.")
    }
    return NextResponse.json({ model })
  } catch (error) {
    return handleError(error, "settings/models")
  }
}
