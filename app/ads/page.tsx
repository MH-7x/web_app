import { Users } from "lucide-react"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { Suspense } from "react"

import { WorkspaceSkeleton } from "@/components/skeletons"
import { AdsWorkspace } from "@/components/ads/workspace"
import { buttonVariants } from "@/components/ui/button"
import { clientEmirates } from "@/lib/ads-api"
import { getClient } from "@/lib/clients"
import { ACTIVE_CLIENT_COOKIE } from "@/lib/constants"

export const metadata: Metadata = { title: "Facebook Ads" }

export default function AdsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Facebook Ads</h1>
      <Suspense fallback={<WorkspaceSkeleton />}>
        <ActiveClientAds />
      </Suspense>
    </div>
  )
}

async function ActiveClientAds() {
  const id = (await cookies()).get(ACTIVE_CLIENT_COOKIE)?.value
  const client = id ? await getClient(id) : null

  if (!client) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-20 text-center ring-1 ring-foreground/10">
        <Users className="size-8 text-muted-foreground/60" />
        <p className="font-medium">Select a client to start generating</p>
        <p className="max-w-md text-sm text-muted-foreground">Pick the client you&apos;re writing ads for from the selector in the top bar.</p>
        <Link href="/clients/new" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Add a client
        </Link>
      </div>
    )
  }

  return (
    <AdsWorkspace
      key={client.id}
      client={{ id: client.id, name: client.name, slug: client.slug, emirate: client.emirate, emirates: clientEmirates(client), website: client.website }}
    />
  )
}
