"use client"

import { ExternalLink, Pencil, Search } from "lucide-react"
import { useState } from "react"

import { MatchCell, StatusBadge, shortDate } from "@/components/citations/parts"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { CITATION_STATUSES, MATCH_FIELDS, MATCH_LABEL, STATUS_LABEL, checkUrl, type CitationClient, type CitationDTO, type CitationStatus } from "@/lib/citations-types"
import { cn } from "@/lib/utils"

type Filter = "all" | CitationStatus

/** The NAP citations for one client: where the business is listed, and whether name, address, phone and website match on each listing. */
export function NapTable({ client, citations, onEdit }: { client: CitationClient; citations: CitationDTO[]; onEdit: (citation: CitationDTO) => void }) {
  const [filter, setFilter] = useState<Filter>("all")

  const counts = Object.fromEntries(CITATION_STATUSES.map((s) => [s, citations.filter((c) => c.status === s).length])) as Record<CitationStatus, number>
  const shown = filter === "all" ? citations : citations.filter((c) => c.status === filter)

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3" role="group" aria-label="Filter by status">
        {(["all", ...CITATION_STATUSES] as const).map((s) => {
          const count = s === "all" ? citations.length : counts[s]
          return (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm ring-1 transition-colors",
                filter === s ? "bg-primary text-primary-foreground ring-primary" : "bg-background ring-foreground/10 hover:bg-muted"
              )}
            >
              {s === "all" ? "All" : s === "issues_found" ? "Issues" : STATUS_LABEL[s]}
              <span className={cn("text-xs tabular-nums", filter === s ? "text-primary-foreground/80" : "text-muted-foreground")}>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-5 py-2.5 font-medium">Directory</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              {MATCH_FIELDS.map((f) => (
                <th key={f} scope="col" className="px-3 py-2.5 text-center font-medium">
                  {MATCH_LABEL[f]}
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 font-medium">Last checked</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                  No directories with this status.
                </td>
              </tr>
            ) : (
              shown.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-5 py-2.5">
                    <a href={c.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-primary hover:underline">
                      {c.source.name} <ExternalLink className="size-3 text-muted-foreground" />
                    </a>
                    <span className="block text-xs text-muted-foreground">Tier {c.source.tier}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={c.status} />
                  </td>
                  {MATCH_FIELDS.map((f) => (
                    <td key={f} className="px-3 py-2.5 text-center">
                      <MatchCell citation={c} field={f} />
                    </td>
                  ))}
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">{shortDate(c.lastChecked)}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <a href={checkUrl(c.source, client.name)} target="_blank" rel="noopener noreferrer" title="Search for the business on this directory" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium hover:bg-muted">
                        <Search className="size-3.5" /> Check
                      </a>
                      <Button type="button" variant="outline" size="sm" onClick={() => onEdit(c)}>
                        <Pencil /> Update
                      </Button>
                      {c.listingUrl && (
                        <a href={c.listingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-muted">
                          View listing <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
