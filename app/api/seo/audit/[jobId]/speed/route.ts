import { NextResponse } from "next/server"

import type { SpeedSelection } from "@/lib/audit/types"
import { BadRequestError } from "@/lib/content-types"
import { handleError, readJson } from "@/lib/gbp-posts-api"
import { getSession } from "@/lib/auth"
import { forwardToWorker } from "@/lib/worker"

/** Answer the "which pages should be speed tested?" question of a paused audit. An empty list skips the speed tests. */
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // the long jobs run on the worker (see lib/worker.ts); with none configured they run right here
  const forwarded = await forwardToWorker(request, session.userId)
  if (forwarded) return forwarded
  try {
    const { jobId } = await params
    const b = await readJson(request)
    if (!Array.isArray(b.selection)) throw new BadRequestError("Send the chosen pages as a list.")
    const selection: SpeedSelection[] = b.selection.map((row: unknown) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>
      if (typeof r.url !== "string" || (r.device !== "mobile" && r.device !== "desktop")) throw new BadRequestError("Each chosen page needs a url and a device.")
      return { url: r.url, device: r.device }
    })
    const { submitSpeedSelection } = await import("@/lib/audit/jobs")
    const problem = submitSpeedSelection(jobId, selection)
    if (problem) return NextResponse.json({ error: problem }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleError(error, "seo/audit/speed")
  }
}
