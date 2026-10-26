import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { ProposalView } from "@/components/proposals/proposal-view"
import { ProposalsSkeleton } from "@/components/skeletons"
import { getProject } from "@/lib/proposals"
import { getBusinessSettings } from "@/lib/settings"

export const metadata: Metadata = { title: "Proposal" }

export default function ProposalPage(props: PageProps<"/proposals/[id]">) {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/proposals" className="text-sm text-muted-foreground hover:text-foreground print:hidden">
        ← All projects
      </Link>
      <Suspense fallback={<ProposalsSkeleton />}>
        <Loaded params={props.params} />
      </Suspense>
    </div>
  )
}

async function Loaded({ params }: { params: PageProps<"/proposals/[id]">["params"] }) {
  await connection()
  const { id } = await params
  const [project, business] = await Promise.all([getProject(id), getBusinessSettings()])
  if (!project) notFound()
  const dateLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai" }).format(new Date())
  return <ProposalView key={project.id} project={project} business={business} dateLabel={dateLabel} />
}
