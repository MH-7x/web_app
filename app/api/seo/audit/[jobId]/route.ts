import { NextResponse } from "next/server"

import { getJob } from "@/lib/audit/jobs"
import { getSession } from "@/lib/auth"

/** Poll an audit's progress. 404 means the server restarted since it began (jobs are in memory). */
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { jobId } = await params
  const since = Number(new URL(request.url).searchParams.get("since"))
  const job = getJob(jobId, Number.isInteger(since) && since > 0 ? since : 0)
  if (!job) return NextResponse.json({ error: "This audit is no longer running (the server may have restarted). Start a new one." }, { status: 404 })
  return NextResponse.json({ job })
}
