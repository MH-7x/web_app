"use client"

import { Loader2 } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { ErrorNote } from "@/components/content/parts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Input, Label, Select, Textarea } from "@/components/ui/input"
import { PRIORITIES, RELEVANT_FOR, SOURCE_CATEGORIES, SOURCE_FIELDS, SOURCE_TYPE_LABEL, SOURCE_TYPES, TIER_LABEL, TIERS, type SourceDTO, type SourceType } from "@/lib/citations-types"
import { CATEGORY_INFO, isCategory } from "@/lib/constants"

const FIELD_LABEL: Record<string, string> = { name: "Name", address: "Address", phone: "Phone", website: "Website", email: "Email", hours: "Hours", description: "Description", photos: "Photos" }
const relevantLabel = (r: string) => (isCategory(r) ? CATEGORY_INFO[r].label : "All business types")

export function SourceDialog({ editing, onClose, onSaved }: { editing: SourceDTO | "new" | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">{editing && <SourceForm key={editing === "new" ? "new" : editing.id} editing={editing} onClose={onClose} onSaved={onSaved} />}</DialogContent>
    </Dialog>
  )
}

function SourceForm({ editing, onClose, onSaved }: { editing: SourceDTO | "new"; onClose: () => void; onSaved: () => void }) {
  const id = useId()
  const source = editing === "new" ? null : editing
  const [name, setName] = useState(source?.name ?? "")
  const [url, setUrl] = useState(source?.url ?? "")
  const [submitUrl, setSubmitUrl] = useState(source?.submitUrl ?? "")
  const [sourceType, setSourceType] = useState<SourceType>(source?.sourceType ?? "nap_citation")
  const [category, setCategory] = useState(source?.category ?? "general")
  const [priority, setPriority] = useState(source?.priority ?? "medium")
  const [tier, setTier] = useState(source?.tier ?? 4)
  const [relevantFor, setRelevantFor] = useState<string[]>(source?.relevantFor ?? ["all"])
  const [napFields, setNapFields] = useState<string[]>(source?.napFields ?? ["name", "address", "phone", "website"])
  const [isFree, setIsFree] = useState(source?.isFree ?? true)
  const [domainAuthority, setDomainAuthority] = useState(String(source?.domainAuthority ?? 0))
  const [notes, setNotes] = useState(source?.notes ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isBacklink = sourceType === "backlink"
  const toggle = (list: string[], set: (v: string[]) => void, value: string) => set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  /** "All" and the specific types exclude each other */
  function toggleRelevant(value: string) {
    if (value === "all") return setRelevantFor(["all"])
    const without = relevantFor.filter((v) => v !== "all" && v !== value)
    setRelevantFor(relevantFor.includes(value) ? without : [...without, value])
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError("Enter the directory's name.")
    if (!url.trim()) return setError("Enter the directory's website address.")
    if (!relevantFor.length) return setError("Choose who this directory is relevant for.")
    setSaving(true)
    setError(null)
    try {
      const body = { name, url, submitUrl, sourceType, category, priority, tier, relevantFor, napFields, isFree, domainAuthority: Number(domainAuthority) || 0, notes }
      const res = await fetch("/api/citations/sources", {
        method: source ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(source ? { id: source.id, ...body } : body),
      })
      const data = (await res.json().catch(() => null)) as { source?: SourceDTO; error?: string } | null
      if (!res.ok || !data?.source) throw new Error(data?.error ?? `Request failed (${res.status}).`)
      toast.success(source ? `${data.source.name} updated` : `${data.source.name} added`, { description: source ? undefined : "Use Add to tracking on a client's My Citations tab to start tracking it." })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      <header>
        <DialogTitle>{source ? `Edit ${source.name}` : "Add a source"}</DialogTitle>
        <DialogDescription>Applies to every client. Domain authority is optional: fill it in from Moz or Ahrefs.</DialogDescription>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-type`}>Type</Label>
          <Select id={`${id}-type`} value={sourceType} onChange={(e) => setSourceType(e.target.value as SourceType)}>
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {SOURCE_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">{isBacklink ? "A profile or post that links to the client's site. Only the link and whether it is live are tracked." : "A directory listing, checked for name, address, phone and website."}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Yellow Pages UAE" autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-url`}>Website</Label>
          <Input id={`${id}-url`} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.example.com" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-submit`}>Submit URL</Label>
          <Input id={`${id}-submit`} type="url" inputMode="url" value={submitUrl} onChange={(e) => setSubmitUrl(e.target.value)} placeholder="The page where a new listing is added (optional)" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-category`}>Category</Label>
          <Select id={`${id}-category`} value={category} onChange={(e) => setCategory(e.target.value)}>
            {SOURCE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-priority`}>Priority</Label>
          <Select id={`${id}-priority`} value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </Select>
        </div>
        {!isBacklink && (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-tier`}>Tier</Label>
            <Select id={`${id}-tier`} value={tier} onChange={(e) => setTier(Number(e.target.value))}>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-da`}>Domain authority</Label>
            <Input id={`${id}-da`} type="number" inputMode="numeric" min={0} max={100} value={domainAuthority} onChange={(e) => setDomainAuthority(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-cost`}>Cost</Label>
            <Select id={`${id}-cost`} value={isFree ? "free" : "paid"} onChange={(e) => setIsFree(e.target.value === "free")}>
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </Select>
          </div>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Relevant for</legend>
        <div className="flex flex-wrap gap-2">
          {RELEVANT_FOR.map((r) => {
            const on = relevantFor.includes(r)
            return (
              <label key={r} className="flex h-8 cursor-pointer items-center gap-2 rounded-lg bg-muted/60 px-3 text-sm ring-1 ring-transparent hover:bg-muted has-checked:bg-primary/10 has-checked:ring-primary/40 has-focus-visible:ring-ring">
                <input type="checkbox" checked={on} onChange={() => toggleRelevant(r)} className="size-3.5 accent-primary" />
                {relevantLabel(r)}
              </label>
            )
          })}
        </div>
      </fieldset>

      {!isBacklink && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">What the directory lets you fill in</legend>
          <p className="text-xs text-muted-foreground">Name, address, phone and website are the details checked for the NAP score. Untick one the directory doesn&apos;t take, so it isn&apos;t counted against the client.</p>
          <div className="flex flex-wrap gap-2">
            {SOURCE_FIELDS.map((f) => (
              <label key={f} className="flex h-8 cursor-pointer items-center gap-2 rounded-lg bg-muted/60 px-3 text-sm ring-1 ring-transparent hover:bg-muted has-checked:bg-primary/10 has-checked:ring-primary/40 has-focus-visible:ring-ring">
                <input type="checkbox" checked={napFields.includes(f)} onChange={() => toggle(napFields, setNapFields, f)} className="size-3.5 accent-primary" />
                {FIELD_LABEL[f]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-notes`}>Notes</Label>
        <Textarea id={`${id}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} placeholder="Submission tips, approval process, login details to ask for..." />
      </div>

      {error && <ErrorNote message={error} />}

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} {source ? "Save changes" : "Add source"}
        </Button>
      </DialogFooter>
    </form>
  )
}
