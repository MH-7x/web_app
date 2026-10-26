import type { Metadata } from "next"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { Suspense } from "react"

import { KeywordsWorkspace } from "@/components/keywords/workspace"
import { KeywordsSkeleton } from "@/components/skeletons"
import { getClientOptions } from "@/lib/clients"
import { ACTIVE_CLIENT_COOKIE } from "@/lib/constants"
import { listKeywordGroups } from "@/lib/keyword-groups"

export const metadata: Metadata = { title: "Keywords" }

export default function KeywordsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Keyword Research</h1>
        <p className="text-sm text-muted-foreground">Google Keyword Planner data, organised in groups for every client.</p>
      </div>
      <Suspense fallback={<KeywordsSkeleton />}>
        <Content />
      </Suspense>
    </div>
  )
}

async function Content() {
  await connection()
  const [groups, clients, jar] = await Promise.all([listKeywordGroups(), getClientOptions(), cookies()])
  return <KeywordsWorkspace initialGroups={groups} clients={clients.map((c) => ({ id: c.id, name: c.name }))} activeClientId={jar.get(ACTIVE_CLIENT_COOKIE)?.value ?? null} />
}
