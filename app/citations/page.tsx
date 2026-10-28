import type { Metadata } from "next"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { Suspense } from "react"

import { CitationsWorkspace } from "@/components/citations/workspace"
import { TableSkeleton } from "@/components/skeletons"
import { countUntracked, listClientCitations, listClientSummaries, listCompetitors, listSources } from "@/lib/citations"
import { getClient } from "@/lib/clients"
import { ACTIVE_CLIENT_COOKIE } from "@/lib/constants"

export const metadata: Metadata = { title: "Citations" }

export default function CitationsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Citations</h1>
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <CitationsContent />
      </Suspense>
    </div>
  )
}

async function CitationsContent() {
  await connection()
  const jar = await cookies()
  const id = jar.get(ACTIVE_CLIENT_COOKIE)?.value
  const client = id ? await getClient(id) : null
  // the directory list is shared by every client, so it loads (and seeds on first use) even with no client selected
  const sources = await listSources()
  const [citations, competitors, untracked] = client ? await Promise.all([listClientCitations(client.id), listCompetitors(client.id), countUntracked(client.id, client.category)]) : [[], [], 0]
  // with no client selected the page shows every client side by side
  const overview = client ? [] : await listClientSummaries()

  return (
    <CitationsWorkspace
      // a different client starts from a clean slate instead of carrying over the previous one's dialogs and filters
      key={client?.id ?? "none"}
      client={client ? { id: client.id, name: client.name, category: client.category, emirate: client.emirate } : null}
      citations={citations}
      sources={sources}
      competitors={competitors}
      untracked={untracked}
      overview={overview}
    />
  )
}
