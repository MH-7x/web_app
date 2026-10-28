"use client"

import { ArrowRight, Users } from "lucide-react"
import { useTransition } from "react"

import { TONE_CLASS } from "@/components/citations/parts"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { setActiveClientAction } from "@/lib/actions"
import { scoreTone, type ClientNapSummary } from "@/lib/citations-types"
import { cn } from "@/lib/utils"

/** Every client's NAP picture at a glance, shown while no client is selected in the top bar. */
export function CitationsOverview({ rows }: { rows: ClientNapSummary[] }) {
  const [pending, startTransition] = useTransition()

  if (rows.length === 0) {
    return <EmptyState icon={Users} title="No clients yet" description="Add a client to start tracking where their business is listed." />
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className={cn("w-full text-sm transition-opacity", pending && "opacity-60")}>
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-5 py-2.5 font-medium">Client</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">NAP score</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Tracked</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Listed</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Issues</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Not listed</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Unchecked</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.client.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-5 py-2.5">
                  <span className="block font-medium">{r.client.name}</span>
                  <span className="block text-xs text-muted-foreground">{r.client.emirate}</span>
                </td>
                <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", TONE_CLASS[scoreTone(r.score)])}>{r.score === null ? "-" : `${r.score}%`}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.trackedCount === 0 ? <span className="text-muted-foreground">Not started</span> : r.trackedCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.listedCount}</td>
                <td className={cn("px-3 py-2.5 text-right tabular-nums", r.issueCount > 0 && "font-medium text-destructive")}>{r.issueCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.notListedCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.uncheckedCount}</td>
                <td className="px-5 py-2.5 text-right">
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => startTransition(() => setActiveClientAction(r.client.id))}>
                    Open <ArrowRight />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
