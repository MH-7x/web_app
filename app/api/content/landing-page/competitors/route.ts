import { NextResponse } from "next/server"

import { getClient } from "@/lib/clients"
import { parseCompetitorUrls } from "@/lib/competitor-types"
import { BadRequestError } from "@/lib/content-types"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { generateSerpBrief } from "@/lib/generators/serp-brief"
import { parseBriefOptions } from "@/lib/landing-page-types"
import { getSession } from "@/lib/auth"
import { isLive, liveDisabled } from "@/lib/live"

// browser start-up, up to five pages, then one Gemini call
export const maxDuration = 300

/**
 * Read the competitor pages that rank for the keyword (from the 30-day cache unless `refresh` is set) and brief the
 * writer from them. Nothing is attached to a landing page until the user generates one with this brief.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (isLive()) return liveDisabled("Competitor insights")
  try {
    const body = await readJson(request)
    if (typeof body.clientId !== "string" || !body.clientId) throw new BadRequestError("Select a client first.")
    const options = parseBriefOptions(body.options)
    const urls = parseCompetitorUrls(body.urls)
    if (!urls.length) throw new BadRequestError("Paste at least one competitor page address.")

    const client = await getClient(body.clientId)
    if (!client) return fail("That client no longer exists.", 404)

    const { analyzeCompetitors } = await import("@/lib/competitor-analysis") // loads Chrome tooling
    const { summaries, errors } = await analyzeCompetitors(urls, { primary: options.primaryKeyword, secondary: options.secondaryKeywords }, { refresh: body.refresh === true })
    const brief = summaries.length ? await generateSerpBrief(client, options, summaries) : null
    return NextResponse.json({ urls, pages: summaries, errors, brief })
  } catch (error) {
    return handleError(error, "content/landing-page/competitors")
  }
}
