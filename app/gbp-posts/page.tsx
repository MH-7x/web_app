import { GeminiKeyBanner } from "@/components/gemini-key-banner"
import { Users } from "lucide-react"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"

import { CalendarSkeleton } from "@/components/skeletons"
import { CalendarWorkspace } from "@/components/gbp/calendar-workspace"
import { buttonVariants } from "@/components/ui/button"
import { formatPhone } from "@/lib/client-schema"
import { getClient } from "@/lib/clients"
import { ACTIVE_CLIENT_COOKIE } from "@/lib/constants"
import { getConnectionSummary } from "@/lib/gbp-api"
import { getActiveGbpJob } from "@/lib/gbp-jobs"
import { listPostsForMonth, listWizardClients } from "@/lib/gbp-posts"
import { dateKey, isMonthKey } from "@/lib/gbp-posts-types"
import { isLive } from "@/lib/live"

export const metadata: Metadata = { title: "GBP Posts" }

export default function GbpPostsPage(props: PageProps<"/gbp-posts">) {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">GBP Posts</h1>
      <Suspense fallback={null}>
        <GeminiKeyBanner />
      </Suspense>
      <Suspense fallback={<CalendarSkeleton />}>
        <ActiveClientPosts searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}

async function ActiveClientPosts({ searchParams }: { searchParams: PageProps<"/gbp-posts">["searchParams"] }) {
  await connection()
  const [sp, jar] = await Promise.all([searchParams, cookies()])
  const today = dateKey(new Date())
  const asked = Array.isArray(sp.month) ? sp.month[0] : sp.month
  const month = asked && isMonthKey(asked) ? asked : today.slice(0, 7)

  const id = jar.get(ACTIVE_CLIENT_COOKIE)?.value
  const client = id ? await getClient(id) : null

  if (!client) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-20 text-center ring-1 ring-foreground/10">
        <Users className="size-8 text-muted-foreground/60" />
        <p className="font-medium">Select a client to see their posts</p>
        <p className="max-w-md text-sm text-muted-foreground">Select a client from the dropdown above to use this module. Each client has their own posting calendar.</p>
        <Link href="/clients/new" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Add a client
        </Link>
      </div>
    )
  }

  const [posts, wizardClients, gbp] = await Promise.all([listPostsForMonth(client.id, month), listWizardClients(), getConnectionSummary(client.id)])
  return (
    <CalendarWorkspace
      key={`${client.id}-${month}`}
      client={{ id: client.id, name: client.name, emirate: client.emirate, phone: formatPhone(client.phone), primaryColor: client.primaryColor, gbpLocation: gbp.connected ? gbp.locationName : null }}
      month={month}
      today={today}
      posts={posts}
      wizardClients={wizardClients}
      activeJob={getActiveGbpJob(client.id)}
      generationDisabled={isLive()}
    />
  )
}
