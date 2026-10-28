"use client"

import { ExternalLink, Info, Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { PriorityBadge, RelevantTags } from "@/components/citations/parts"
import { SourceDialog } from "@/components/citations/source-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select } from "@/components/ui/input"
import { PRIORITIES, SOURCE_CATEGORIES, SOURCE_TYPE_LABEL, categoryLabel, isRelevant, type SourceDTO, type SourceType } from "@/lib/citations-types"
import { CATEGORIES, CATEGORY_INFO, type ClientCategory } from "@/lib/constants"
import { cn } from "@/lib/utils"

/** The master list of directories. It applies to every client: adding one here makes it available to each client's tracking. */
export function SourcesTab({ sources, onChange }: { sources: SourceDTO[]; onChange: () => void }) {
  const [sourceType, setSourceType] = useState<"all" | SourceType>("all")
  const [category, setCategory] = useState("")
  const [priority, setPriority] = useState("")
  const [relevantFor, setRelevantFor] = useState("")
  /** the directory being edited, "new" for the add form, null when closed */
  const [editing, setEditing] = useState<SourceDTO | "new" | null>(null)

  const ofType = sourceType === "all" ? sources : sources.filter((s) => s.sourceType === sourceType)
  const shown = ofType.filter(
    (s) => (!category || s.category === category) && (!priority || s.priority === priority) && (!relevantFor || isRelevant(s.relevantFor, relevantFor as ClientCategory))
  )
  const filtered = Boolean(category || priority || relevantFor)
  const typeCount = (t: "all" | SourceType) => (t === "all" ? sources.length : sources.filter((s) => s.sourceType === t).length)

  async function remove(s: SourceDTO) {
    if (!window.confirm(`Delete ${s.name}? It will also be removed from every client's citation tracking, including anything recorded for it.`)) return
    try {
      const res = await fetch(`/api/citations/sources?id=${encodeURIComponent(s.id)}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`Request failed (${res.status}).`)
      toast.success(`${s.name} deleted`)
      onChange()
    } catch (e) {
      toast.error("Couldn't delete the directory", { description: e instanceof Error ? e.message : "Please try again." })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>These sources apply to all clients. Adding a source here makes it available for every client&apos;s citation tracking.</p>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3" role="group" aria-label="Filter by source type">
          {(["nap_citation", "backlink", "all"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={sourceType === t}
              onClick={() => setSourceType(t)}
              className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm ring-1 transition-colors", sourceType === t ? "bg-primary text-primary-foreground ring-primary" : "bg-background ring-foreground/10 hover:bg-muted")}
            >
              {t === "all" ? "All" : SOURCE_TYPE_LABEL[t]}
              <span className={cn("text-xs tabular-nums", sourceType === t ? "text-primary-foreground/80" : "text-muted-foreground")}>{typeCount(t)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3" role="group" aria-label="Filter directories">
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
            <option value="">All categories</option>
            {SOURCE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-40">
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p} className="capitalize">
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </Select>
          <Select aria-label="Relevant for" value={relevantFor} onChange={(e) => setRelevantFor(e.target.value)} className="w-48">
            <option value="">All business types</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_INFO[c].label}
              </option>
            ))}
          </Select>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setCategory("")
                setPriority("")
                setRelevantFor("")
              }}
              className="text-sm text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            {shown.length} of {ofType.length}
          </span>
          <Button size="lg" onClick={() => setEditing("new")}>
            <Plus /> Add Source
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="px-5 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Category</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Priority</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Relevant for</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium" title="Domain authority">DA</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Cost</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                    No directories match these filters.
                  </td>
                </tr>
              ) : (
                shown.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-5 py-2.5">
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-primary hover:underline">
                        {s.name} <ExternalLink className="size-3 text-muted-foreground" />
                      </a>
                      <span className="block text-xs text-muted-foreground">{s.sourceType === "backlink" ? SOURCE_TYPE_LABEL.backlink : `Tier ${s.tier}`}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="muted">{categoryLabel(s.category)}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <PriorityBadge priority={s.priority} />
                    </td>
                    <td className="px-3 py-2.5">
                      <RelevantTags relevantFor={s.relevantFor} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.domainAuthority || <span className="text-muted-foreground">-</span>}</td>
                    <td className="px-3 py-2.5">{s.isFree ? <Badge variant="success">Free</Badge> : <Badge variant="outline">Paid</Badge>}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}>
                          <Pencil />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${s.name}`} onClick={() => remove(s)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <SourceDialog editing={editing} onClose={() => setEditing(null)} onSaved={onChange} />
    </div>
  )
}
