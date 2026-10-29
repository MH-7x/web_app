import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { db } from "@/lib/db"
import { isWorkerOnly } from "@/lib/worker-auth"

/**
 * Is this deployment healthy? On a worker it is public (the hosting platform and the deploy checklist call it, and it
 * reveals only yes/no flags). On the dashboard it needs a login like every other route.
 */
export async function GET() {
  const worker = isWorkerOnly()
  if (!worker) {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  const database = await db.$queryRaw`select 1`.then(
    () => true,
    () => false
  )
  // a worker is useless without a browser for the audit, so say whether one was found
  const browser = worker ? !!(await (await import("@/lib/audit/browser")).findBrowserPath()) : undefined
  const ok = database && browser !== false
  return NextResponse.json({ ok, mode: worker ? "worker" : "dashboard", database, ...(browser === undefined ? {} : { browser }) }, { status: ok ? 200 : 503 })
}
