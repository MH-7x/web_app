import { GeminiKeyBanner } from "@/components/gemini-key-banner"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import { Suspense } from "react"

import { HumanizerSkeleton } from "@/components/skeletons"
import { HumanizerWorkspace } from "@/components/humanizer/workspace"
import { getClientOptions } from "@/lib/clients"
import { ACTIVE_CLIENT_COOKIE } from "@/lib/constants"

export const metadata: Metadata = { title: "Humanizer" }

export default function HumanizerPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Humanizer</h1>
      <Suspense fallback={null}>
        <GeminiKeyBanner />
      </Suspense>
      <Suspense fallback={<HumanizerSkeleton />}>
        <ActiveClientHumanizer />
      </Suspense>
    </div>
  )
}

async function ActiveClientHumanizer() {
  const id = (await cookies()).get(ACTIVE_CLIENT_COOKIE)?.value
  const client = id ? (await getClientOptions()).find((c) => c.id === id) : undefined
  return <HumanizerWorkspace key={client?.id ?? "none"} client={client ? { id: client.id, name: client.name } : null} />
}
