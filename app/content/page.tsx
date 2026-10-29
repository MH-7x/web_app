import { GeminiKeyBanner } from "@/components/gemini-key-banner"
import { Users } from "lucide-react"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { Suspense } from "react"

import { WorkspaceSkeleton } from "@/components/skeletons"
import { ContentWorkspace } from "@/components/content/workspace"
import { buttonVariants } from "@/components/ui/button"
import { getClient } from "@/lib/clients"
import { ACTIVE_CLIENT_COOKIE } from "@/lib/constants"
import { isLive } from "@/lib/live"

export const metadata: Metadata = { title: "Content" }

export default function ContentPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
      <Suspense fallback={null}>
        <GeminiKeyBanner />
      </Suspense>
      <Suspense fallback={<WorkspaceSkeleton />}>
        <ActiveClientWorkspace />
      </Suspense>
    </div>
  )
}

async function ActiveClientWorkspace() {
  const id = (await cookies()).get(ACTIVE_CLIENT_COOKIE)?.value
  const client = id ? await getClient(id) : null

  if (!client) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-20 text-center ring-1 ring-foreground/10">
        <Users className="size-8 text-muted-foreground/60" />
        <p className="font-medium">Select a client to start generating</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Select a client from the dropdown above to use this module. Every generator uses that client&apos;s profile.
        </p>
        <Link href="/clients/new" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Add a client
        </Link>
      </div>
    )
  }

  // key resets every tab's output when the active client changes
  return (
    <ContentWorkspace
      key={client.id}
      landingPageDisabled={isLive()}
      client={{
        id: client.id,
        name: client.name,
        slug: client.slug,
        emirate: client.emirate,
        emirates: [client.emirate, ...client.emiratesServed],
        areas: client.areas,
        services: client.services,
        phone: client.phone,
        whatsapp: client.whatsapp,
        primaryColor: client.primaryColor ?? "#0f766e",
        hasCompanyProfile: client.companyProfile.trim().length > 0,
      }}
    />
  )
}
