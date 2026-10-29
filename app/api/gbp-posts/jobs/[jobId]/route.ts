import { NextResponse } from "next/server"

import { getGbpJob } from "@/lib/gbp-jobs"
import { getSession } from "@/lib/auth"
import { forwardToWorker } from "@/lib/worker"

/** Poll a post-writing job. 404 means the server restarted since it began (jobs are in memory). */
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // the long jobs run on the worker (see lib/worker.ts); with none configured they run right here
  const forwarded = await forwardToWorker(request, session.userId)
  if (forwarded) return forwarded
  const { jobId } = await params
  const job = getGbpJob(jobId)
  if (!job) return NextResponse.json({ error: "This job is no longer running (the server may have restarted). Posts already written are on the calendar." }, { status: 404 })
  return NextResponse.json({ job })
}
