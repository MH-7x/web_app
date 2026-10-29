import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { forwardToWorker } from "@/lib/worker"

/** The audit currently queued or running for a client, if any: `{ job: ... | null }`. */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const forwarded = await forwardToWorker(request, session.userId)
  if (forwarded) return forwarded
  const clientId = new URL(request.url).searchParams.get("clientId")
  if (!clientId) return NextResponse.json({ error: "Missing clientId." }, { status: 400 })
  const { getActiveJob } = await import("@/lib/audit/jobs")
  return NextResponse.json({ job: getActiveJob(clientId) })
}
