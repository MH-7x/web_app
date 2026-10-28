"use client"

import { ChevronDown, Loader2, Pencil, Plus, Swords, Trash2 } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { Chip } from "@/components/citations/parts"
import { ErrorNote } from "@/components/content/parts"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Input, Label } from "@/components/ui/input"
import { TIER_LABEL, compareCompetitor, isListed, type CitationDTO, type CompetitorDTO } from "@/lib/citations-types"
import { cn } from "@/lib/utils"

/** Which directories a competitor is on, set against where the client is listed. Only yes or no per directory, no NAP checking. */
export function CompetitorsPanel({
  clientId,
  clientName,
  citations,
  competitors,
  onChange,
}: {
  clientId: string
  clientName: string
  citations: CitationDTO[]
  competitors: CompetitorDTO[]
  onChange: (next: CompetitorDTO[]) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(true)
  /** the competitor being edited, "new" for the add form, null when closed */
  const [editing, setEditing] = useState<CompetitorDTO | "new" | null>(null)

  const total = citations.length
  const yours = citations.filter(isListed).length
  const rows = competitors.map((c) => compareCompetitor(c, citations)).sort((a, b) => b.listedOn - a.listedOn)

  async function remove(c: CompetitorDTO) {
    if (!window.confirm(`Stop tracking ${c.name}?`)) return
    try {
      const res = await fetch(`/api/clients/${clientId}/citations/competitors?competitorId=${encodeURIComponent(c.id)}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`Request failed (${res.status}).`)
      onChange(competitors.filter((x) => x.id !== c.id))
    } catch (e) {
      toast.error("Couldn't remove the competitor", { description: e instanceof Error ? e.message : "Please try again." })
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} className="flex flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Swords className="size-5 text-muted-foreground" />
          <span className="flex-1">
            <span className="block font-semibold">Competitor comparison</span>
            <span className="block text-sm text-muted-foreground">
              {competitors.length ? `You: listed on ${yours}/${total} directories` : "Track where a competitor is listed to see what you're missing."}
            </span>
          </span>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing("new")}>
          <Plus /> Add competitor
        </Button>
      </div>

      {open && (
        <div id={id} className="space-y-3 border-t border-border px-5 py-4">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No competitors yet. Add one, then tick the directories you found them on. It shows which listings {clientName} is missing.</p>
          ) : (
            rows.map((r) => {
              const competitor = competitors.find((c) => c.id === r.id)!
              return (
                <div key={r.id} className="space-y-2 rounded-lg bg-muted/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{r.name}</p>
                    <Chip>
                      listed on {r.listedOn}/{total}
                    </Chip>
                    <span className="ml-auto flex gap-1">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${r.name}`} onClick={() => setEditing(competitor)}>
                        <Pencil />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${r.name}`} onClick={() => remove(competitor)}>
                        <Trash2 />
                      </Button>
                    </span>
                  </div>
                  <p className="text-sm">
                    <span className="font-medium">You:</span> listed on {yours}/{total} directories. <span className="font-medium">{r.name}:</span> listed on {r.listedOn}/{total}.
                  </p>
                  {r.missingFromClient.length ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Missing from your listings ({r.missingFromClient.length}):</p>
                      <ul className="flex flex-wrap gap-1.5">
                        {r.missingFromClient.map((m) => (
                          <li key={m.id} className="rounded-md bg-background px-2 py-0.5 text-xs ring-1 ring-foreground/10" title={m.unchecked ? "Not checked yet for this client" : "Not listed"}>
                            {m.name}
                            {m.unchecked && <span className="text-muted-foreground"> (unchecked)</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{clientName} is listed everywhere {r.name} is.</p>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      <CompetitorDialog clientId={clientId} editing={editing} citations={citations} competitors={competitors} onChange={onChange} onClose={() => setEditing(null)} />
    </Card>
  )
}

function CompetitorDialog({
  clientId,
  editing,
  citations,
  competitors,
  onChange,
  onClose,
}: {
  clientId: string
  editing: CompetitorDTO | "new" | null
  citations: CitationDTO[]
  competitors: CompetitorDTO[]
  onChange: (next: CompetitorDTO[]) => void
  onClose: () => void
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        {editing && <CompetitorForm key={editing === "new" ? "new" : editing.id} clientId={clientId} editing={editing} citations={citations} competitors={competitors} onChange={onChange} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function CompetitorForm({
  clientId,
  editing,
  citations,
  competitors,
  onChange,
  onClose,
}: {
  clientId: string
  editing: CompetitorDTO | "new"
  citations: CitationDTO[]
  competitors: CompetitorDTO[]
  onChange: (next: CompetitorDTO[]) => void
  onClose: () => void
}) {
  const id = useId()
  const existing = editing === "new" ? null : editing
  const [name, setName] = useState(existing?.name ?? "")
  const [picked, setPicked] = useState<Set<string>>(new Set(existing?.sourceIds ?? []))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tiers = [1, 2, 3, 4].map((t) => ({ tier: t, items: citations.filter((c) => c.source.tier === t) })).filter((g) => g.items.length)
  const toggle = (sourceId: string) =>
    setPicked((p) => {
      const next = new Set(p)
      if (!next.delete(sourceId)) next.add(sourceId)
      return next
    })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError("Enter the competitor's name.")
    setSaving(true)
    setError(null)
    try {
      const sourceIds = [...picked]
      const res = await fetch(`/api/clients/${clientId}/citations/competitors`, {
        method: existing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(existing ? { competitorId: existing.id, name, sourceIds } : { name, sourceIds }),
      })
      const body = (await res.json().catch(() => null)) as { competitor?: CompetitorDTO; error?: string } | null
      if (!res.ok || !body?.competitor) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      const saved = body.competitor
      onChange(existing ? competitors.map((c) => (c.id === saved.id ? saved : c)) : [...competitors, saved])
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      <header>
        <DialogTitle>{existing ? "Edit competitor" : "Add a competitor"}</DialogTitle>
        <DialogDescription>Tick every directory where you found this competitor listed.</DialogDescription>
      </header>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`}>Competitor name</Label>
        <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ABC Movers" autoComplete="off" />
      </div>

      <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg bg-muted/40 p-3">
        {tiers.map((g) => (
          <fieldset key={g.tier} className="space-y-1">
            <legend className="text-xs font-medium text-muted-foreground">{TIER_LABEL[g.tier]}</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {g.items.map((c) => (
                <label key={c.source.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted has-focus-visible:ring-2 has-focus-visible:ring-ring">
                  <input type="checkbox" checked={picked.has(c.source.id)} onChange={() => toggle(c.source.id)} className="size-4 accent-primary" />
                  {c.source.name}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{picked.size} selected</p>

      {error && <ErrorNote message={error} />}

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} {existing ? "Save" : "Add competitor"}
        </Button>
      </DialogFooter>
    </form>
  )
}
