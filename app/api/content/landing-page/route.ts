import { NextResponse } from "next/server"

import { getClient } from "@/lib/clients"
import { BadRequestError } from "@/lib/content-types"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { generateLandingPage } from "@/lib/generators/landing-page"
import { parseLandingRequest } from "@/lib/landing-page-types"
import { getSession } from "@/lib/auth"

// a plan, a draft, section expansions and up to three revisions, each a model call. 300 seconds is the most a Vercel Hobby
// function may run; on a Pro plan this can go up to 800 (and REVISE_UNTIL_MS in the generator can be raised with it).
export const maxDuration = 300

/**
 * Generate landing page content for the client. Nothing is stored: the page is a draft until the user
 * chooses Save to History (POST /api/content/landing-page/save).
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await readJson(request)
    if (typeof body.clientId !== "string" || !body.clientId) throw new BadRequestError("Select a client first.")
    const { language, options } = parseLandingRequest(body)

    const client = await getClient(body.clientId)
    if (!client) return fail("That client no longer exists.", 404)

    const result = await generateLandingPage(client, { ...options, language })
    const warning = client.companyProfile.trim() ? undefined : "This client has no company profile, so the page may be generic. Add one on the client profile."
    return NextResponse.json({ language, options, result, warning })
  } catch (error) {
    return handleError(error, "content/landing-page")
  }
}
