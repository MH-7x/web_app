import { NextResponse } from "next/server"

import { getGbpJob } from "@/lib/gbp-jobs"

/** Poll a post-writing job. 404 means the server restarted since it began (jobs are in memory). */
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const job = getGbpJob(jobId)
  if (!job) return NextResponse.json({ error: "This job is no longer running (the server may have restarted). Posts already written are on the calendar." }, { status: 404 })
  return NextResponse.json({ job })
}
