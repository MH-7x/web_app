"use client"

import { ChevronDown, ExternalLink, ListChecks } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { PriorityBadge } from "@/components/citations/parts"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { buildPlan, type CitationDTO } from "@/lib/citations-types"
import { cn } from "@/lib/utils"

export type PlanScope = "nap" | "backlinks" | "all"

/**
 * The prioritized to-do list. Tick an item once it's done: fixed, or submitted and waiting to appear. Backlinks to build have no tick:
 * they leave the list when you record the link. `scope` picks which steps show: the NAP ones, the backlinks, or both.
 */
export function ActionPlan({ clientId, citations, scope, onToggle }: { clientId: string; citations: CitationDTO[]; scope: PlanScope; onToggle: (citationId: string, done: boolean) => void }) {
  const id = useId()
  const [open, setOpen] = useState(true)
  const plan = buildPlan(citations)
  const steps = plan.steps.filter((s) => scope === "all" || (scope === "backlinks") === (s.id === "backlinks"))
  const items = steps.flatMap((s) => s.items)
  const total = items.length
  const remaining = items.filter((i) => !i.done).length
  const napScope = scope !== "backlinks"

  async function toggle(citationId: string, done: boolean) {
    onToggle(citationId, done) // show the tick at once
    try {
      const res = await fetch(`/api/clients/${clientId}/citations`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ citationId, actionDone: done }) })
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Request failed (${res.status}).`)
    } catch (e) {
      onToggle(citationId, !done)
      toast.error("Couldn't save that tick", { description: e instanceof Error ? e.message : "Please try again." })
    }
  }

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} className="flex w-full items-center gap-3 px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
        <ListChecks className="size-5 text-muted-foreground" />
        <span className="flex-1">
          <span className="block font-semibold">Action plan</span>
          <span className="block text-sm text-muted-foreground">
            {total === 0
              ? napScope && plan.uncheckedCount > 0
                ? `Nothing to do yet: ${plan.uncheckedCount} directories haven't been checked.`
                : napScope
                  ? "Nothing to do. Every checked directory is listed correctly."
                  : "Nothing to do. Every backlink source has a link recorded."
              : `${remaining} of ${total} to do`}
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div id={id} className="space-y-5 border-t border-border px-5 py-4">
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">
              {!napScope
                ? "Use Check link now and then to catch links that have gone dead."
                : plan.uncheckedCount > 0
                  ? "Use Quick Check to search each directory, then record whether the business is listed. The plan builds from what you find."
                  : "Re-check listings from time to time so this stays true."}
            </p>
          ) : (
            steps
              .filter((s) => s.items.length > 0)
              .map((step, index) => (
                <section key={step.id} aria-label={step.title} className="space-y-2">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {index + 1}. {step.title} <span className="font-normal text-muted-foreground">({step.items.filter((i) => !i.done).length} left)</span>
                    </h3>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                  <ul className="divide-y divide-border rounded-lg ring-1 ring-foreground/10">
                    {step.items.map((item) => (
                      <li key={item.citationId} className="flex items-center gap-3 px-3 py-2">
                        {item.action === "build" ? (
                          <span aria-hidden className="size-4 shrink-0" />
                        ) : (
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={(e) => toggle(item.citationId, e.target.checked)}
                            aria-label={`${item.action === "fix" ? "Fixed" : "Submitted to"} ${item.sourceName}`}
                            className="size-4 shrink-0 accent-primary"
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className={cn("flex flex-wrap items-center gap-2 text-sm font-medium", item.done && "text-muted-foreground line-through")}>
                            {item.sourceName}
                            <PriorityBadge priority={item.priority} />
                            {item.done && <Badge variant="success">{item.action === "fix" ? "Fix reported" : "Submitted"}</Badge>}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground" title={item.detail}>
                            {item.detail}
                          </span>
                        </span>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
                          {item.action === "fix" ? "Fix listing" : item.action === "build" ? "Create" : "Submit"} <ExternalLink className="size-3.5" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
          )}
        </div>
      )}
    </Card>
  )
}
