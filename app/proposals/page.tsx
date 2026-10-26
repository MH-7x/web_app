import { FileText, Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"

import { EmptyState } from "@/components/empty-state"
import { RowActions } from "@/components/proposals/row-actions"
import { StatusBadge } from "@/components/proposals/status-badge"
import { ProposalsSkeleton } from "@/components/skeletons"
import { buttonVariants } from "@/components/ui/button"
import { formatDate } from "@/lib/format"
import { isStatus, listProjects } from "@/lib/proposals"
import { STATUSES, formatAed } from "@/lib/proposals-types"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Proposals" }

export default function ProposalsPage(props: PageProps<"/proposals">) {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proposals</h1>
          <p className="text-sm text-muted-foreground">Website projects and the proposals you send for them.</p>
        </div>
        <Link href="/proposals/new" className={buttonVariants({ size: "lg" })}>
          <Plus /> New Project
        </Link>
      </div>
      <Suspense fallback={<ProposalsSkeleton />}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}

async function List({ searchParams }: { searchParams: PageProps<"/proposals">["searchParams"] }) {
  await connection()
  const sp = await searchParams
  const asked = Array.isArray(sp.status) ? sp.status[0] : sp.status
  const status = isStatus(asked) ? asked : undefined
  const [projects, all] = await Promise.all([listProjects(status), status ? listProjects() : null])
  const total = (all ?? projects).length

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
        {[{ value: "", label: "All" }, ...STATUSES].map((s) => (
          <Link
            key={s.value || "all"}
            href={s.value ? `/proposals?status=${s.value}` : "/proposals"}
            aria-current={(status ?? "") === s.value ? "true" : undefined}
            className={cn("rounded-lg px-3 py-1 text-sm transition-colors", (status ?? "") === s.value ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground hover:bg-muted")}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={total === 0 ? "No projects yet" : "No projects with this status"}
          description={total === 0 ? "Add a website project from a WhatsApp enquiry, then let Gemini write the proposal for you." : "Try another status."}
        >
          {total === 0 && (
            <Link href="/proposals/new" className={buttonVariants()}>
              New Project
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60 text-left text-[11px] tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/proposals/${p.id}`} className="hover:text-primary">
                      {p.name}
                    </Link>
                    {!p.hasProposal && <span className="ml-2 text-xs font-normal text-muted-foreground">no proposal yet</span>}
                  </td>
                  <td className="px-4 py-3">{p.clientName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatAed(p.totalCost)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDate(new Date(p.createdAt))}</td>
                  <td className="px-4 py-3">
                    <RowActions id={p.id} name={p.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
