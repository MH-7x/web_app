import { unstable_rethrow } from "next/navigation"
import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { GbpApiError } from "@/lib/gbp-api"
import { GeminiError } from "@/lib/gemini"

export const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

export const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

export async function readJson(request: Request) {
  try {
    return asObject(await request.json())
  } catch {
    throw new BadRequestError("Request body must be JSON.")
  }
}

/** Turn thrown errors into the JSON error responses the UI expects. */
export function handleError(error: unknown, scope: string) {
  // Next's own control-flow errors (prerender bail-out, redirects) must not be turned into 500 responses
  unstable_rethrow(error)
  if (error instanceof BadRequestError) return fail(error.message, 400)
  if (error instanceof GeminiError) return fail(error.message, error.status)
  if (error instanceof GbpApiError) return fail(error.message, error.status)
  console.error(`[${scope}]`, error)
  if (isDatabaseError(error)) return fail("Database error", 500)
  return fail("Something went wrong. Please try again.", 500)
}

/** Prisma errors carry internals (table names, query text) the UI must never see. */
function isDatabaseError(error: unknown) {
  return error instanceof Error && /^PrismaClient/.test(error.name)
}
