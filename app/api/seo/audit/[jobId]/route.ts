import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { forwardToWorker } from "@/lib/worker"

/** Poll an audit's progress. 404 means the server restarted since it began (jobs are in memory). */
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // the long jobs run on the worker (see lib/worker.ts); with none configured they run right here
  const forwarded = await forwardToWorker(request, session.userId)
  if (forwarded) return forwarded
  const { jobId } = await params
  const since = Number(new URL(request.url).searchParams.get("since"))
  const { getJob } = await import("@/lib/audit/jobs")
  const job = getJob(jobId, Number.isInteger(since) && since > 0 ? since : 0)
  if (!job) return NextResponse.json({ error: "This audit is no longer running (the server may have restarted). Start a new one." }, { status: 404 })
  return NextResponse.json({ job })
}
