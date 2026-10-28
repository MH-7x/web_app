"use client"

import { Loader2 } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { ErrorNote } from "@/components/content/parts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Input, Label, Select } from "@/components/ui/input"
import { CITATION_STATUSES, MATCH_FIELDS, MATCH_LABEL, STATUS_LABEL, matchOf, tracksField, type CitationDTO, type CitationStatus, type MatchField } from "@/lib/citations-types"

/** Record what you found on a directory: whether the client is listed, and which of the name, address, phone and website are right. */
export function StatusDialog({ clientId, citation, onClose, onSaved }: { clientId: string; citation: CitationDTO | null; onClose: () => void; onSaved: (citation: CitationDTO) => void }) {
  return (
    <Dialog open={citation !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">{citation && <Body key={citation.id} clientId={clientId} citation={citation} onClose={onClose} onSaved={onSaved} />}</DialogContent>
    </Dialog>
  )
}

function Body({ clientId, citation, onClose, onSaved }: { clientId: string; citation: CitationDTO; onClose: () => void; onSaved: (citation: CitationDTO) => void }) {
  const id = useId()
  const wasListed = citation.status === "listed" || citation.status === "issues_found"
  const [status, setStatus] = useState<CitationStatus>(citation.status)
  // choosing "Listed" starts with every detail ticked: untick what is wrong
  const [matches, setMatches] = useState<Record<MatchField, boolean>>(() => Object.fromEntries(MATCH_FIELDS.map((f) => [f, wasListed ? matchOf(citation, f) : true])) as Record<MatchField, boolean>)
  const [listingUrl, setListingUrl] = useState(citation.listingUrl)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const showDetails = status === "listed" || status === "issues_found"
  const tracked = MATCH_FIELDS.filter((f) => tracksField(citation.source, f))
  const wrong = tracked.filter((f) => !matches[f])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/citations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          citationId: citation.id,
          status,
          listingUrl,
          ...(showDetails ? { nameMatch: matches.name, addressMatch: matches.address, phoneMatch: matches.phone, websiteMatch: matches.website } : {}),
        }),
      })
      const body = (await res.json().catch(() => null)) as { citation?: CitationDTO; error?: string } | null
      if (!res.ok || !body?.citation) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      toast.success(`${citation.source.name}: ${STATUS_LABEL[body.citation.status]}`)
      onSaved(body.citation)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      <header>
        <DialogTitle>{citation.source.name}</DialogTitle>
        <DialogDescription>Search the directory for the business, then record what you found.</DialogDescription>
      </header>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-status`}>Status</Label>
        <Select id={`${id}-status`} value={status} onChange={(e) => setStatus(e.target.value as CitationStatus)}>
          {CITATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>

      {showDetails && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Which details on the listing are correct?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {tracked.map((f) => (
              <label key={f} className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-muted/60 p-3 text-sm ring-1 ring-transparent hover:bg-muted has-focus-visible:ring-ring">
                <input type="checkbox" checked={matches[f]} onChange={(e) => setMatches((m) => ({ ...m, [f]: e.target.checked }))} className="size-4 accent-primary" />
                {MATCH_LABEL[f]} is correct
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {wrong.length ? `Will be saved as Issues found: ${wrong.map((f) => MATCH_LABEL[f].toLowerCase()).join(", ")} ${wrong.length === 1 ? "is" : "are"} wrong.` : "Every detail is correct, so this is saved as Listed."}
          </p>
        </fieldset>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-url`}>Listing URL</Label>
        <Input id={`${id}-url`} type="url" inputMode="url" value={listingUrl} onChange={(e) => setListingUrl(e.target.value)} placeholder="Link to the business's page on this directory" />
        <p className="text-xs text-muted-foreground">Optional. Saved so you can open the listing later to fix it.</p>
      </div>

      {error && <ErrorNote message={error} />}

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} Save
        </Button>
      </DialogFooter>
    </form>
  )
}
