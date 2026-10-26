import { NextResponse } from "next/server"

import { getClient } from "@/lib/clients"
import { BadRequestError } from "@/lib/content-types"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { generateLandingPage } from "@/lib/generators/landing-page"
import { parseLandingRequest } from "@/lib/landing-page-types"

// two languages, each with a possible second pass
export const maxDuration = 300

/**
 * Generate landing page content for the client. Nothing is stored: the page is a draft until the user
 * chooses Save to History (POST /api/content/landing-page/save).
 */
export async function POST(request: Request) {
  try {
    const body = await readJson(request)
    if (typeof body.clientId !== "string" || !body.clientId) throw new BadRequestError("Select a client first.")
    const { language, options } = parseLandingRequest(body)

    const client = await getClient(body.clientId)
    if (!client) return fail("That client no longer exists.", 404)

    const result = await generateLandingPage(client, { ...options, language })
    return NextResponse.json({ language, options, result })
  } catch (error) {
    return handleError(error, "content/landing-page")
  }
}
