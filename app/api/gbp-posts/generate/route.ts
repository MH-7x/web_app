import { NextResponse } from "next/server"

import { getClient } from "@/lib/clients"
import { BadRequestError } from "@/lib/content-types"
import { startPostsJob } from "@/lib/gbp-jobs"
import { handleError, readJson } from "@/lib/gbp-posts-api"
import { MAX_KEYWORDS, MAX_WEEKS, POST_LANGUAGES, POSTS_PER_WEEK, isDateKey, type PostLanguage } from "@/lib/gbp-posts-types"
import { getSession } from "@/lib/auth"
import { forwardToWorker } from "@/lib/worker"

/**
 * Start writing posts: `weeks` weeks at exactly 3 posts a week, covering the given keywords, in the chosen language.
 * Returns a job; posts are saved as drafts as they are written.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // the long jobs run on the worker (see lib/worker.ts); with none configured they run right here
  const forwarded = await forwardToWorker(request, session.userId)
  if (forwarded) return forwarded
  try {
    const b = await readJson(request)
    if (typeof b.clientId !== "string" || !b.clientId) throw new BadRequestError("Choose a business first.")

    const weeks = Math.round(Number(b.weeks))
    if (!(weeks >= 1 && weeks <= MAX_WEEKS)) throw new BadRequestError(`Choose between 1 and ${MAX_WEEKS} weeks (${POSTS_PER_WEEK} posts each).`)

    const keywords = Array.isArray(b.keywords) ? [...new Set(b.keywords.filter((k): k is string => typeof k === "string").map((k) => k.trim()).filter(Boolean))].map((k) => k.slice(0, 80)).slice(0, MAX_KEYWORDS) : []
    if (!keywords.length) throw new BadRequestError("Add at least one keyword to cover.")

    if (!(POST_LANGUAGES as unknown[]).includes(b.language)) throw new BadRequestError("Choose English, Arabic or both.")
    if (typeof b.startDate !== "string" || !isDateKey(b.startDate)) throw new BadRequestError("Choose a start date.")

    const client = await getClient(b.clientId)
    if (!client) return NextResponse.json({ error: "That client no longer exists." }, { status: 404 })

    const job = await startPostsJob(client, { weeks, keywords, language: b.language as PostLanguage, startDate: b.startDate })
    return NextResponse.json({ job })
  } catch (error) {
    return handleError(error, "gbp-posts/generate")
  }
}
