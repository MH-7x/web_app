import { GeminiKeyBanner } from "@/components/gemini-key-banner"
import { Users } from "lucide-react"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"

import { ReportsSkeleton } from "@/components/skeletons"
import { ReportsWorkspace } from "@/components/reports/workspace"
import { buttonVariants } from "@/components/ui/button"
import { getClientOptions } from "@/lib/clients"
import { ACTIVE_CLIENT_COOKIE } from "@/lib/constants"

export const metadata: Metadata = { title: "Reports" }

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight print:hidden">Reports</h1>
      <Suspense fallback={null}>
        <GeminiKeyBanner />
      </Suspense>
      <Suspense fallback={<ReportsSkeleton />}>
        <ActiveClientReports />
      </Suspense>
    </div>
  )
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

async function ActiveClientReports() {
  await connection()
  const id = (await cookies()).get(ACTIVE_CLIENT_COOKIE)?.value
  const client = id ? (await getClientOptions()).find((c) => c.id === id) : undefined

  if (!client) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-20 text-center ring-1 ring-foreground/10">
        <Users className="size-8 text-muted-foreground/60" />
        <p className="font-medium">Select a client to write a report</p>
        <p className="max-w-md text-sm text-muted-foreground">Select a client from the dropdown above to use this module. Reports are written for one client at a time.</p>
        <Link href="/clients/new" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Add a client
        </Link>
      </div>
    )
  }

  const now = new Date()
  // reports are written after a month ends, so start on last month
  return <ReportsWorkspace key={client.id} client={{ id: client.id, name: client.name }} defaultMonth={monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))} maxMonth={monthKey(now)} />
}
