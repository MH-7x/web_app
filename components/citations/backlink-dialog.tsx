"use client"

import { Loader2 } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { ErrorNote } from "@/components/content/parts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Input, Label, Select } from "@/components/ui/input"
import { LINK_STATUSES, LINK_STATUS_LABEL, type CitationDTO, type LinkStatus } from "@/lib/citations-types"

/** Record the link you created on a backlink source: its URL and whether it is live. */
export function BacklinkDialog({ clientId, citation, onClose, onSaved }: { clientId: string; citation: CitationDTO | null; onClose: () => void; onSaved: (citation: CitationDTO) => void }) {
  return (
    <Dialog open={citation !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">{citation && <Body key={citation.id} clientId={clientId} citation={citation} onClose={onClose} onSaved={onSaved} />}</DialogContent>
    </Dialog>
  )
}

function Body({ clientId, citation, onClose, onSaved }: { clientId: string; citation: CitationDTO; onClose: () => void; onSaved: (citation: CitationDTO) => void }) {
  const id = useId()
  const [linkUrl, setLinkUrl] = useState(citation.linkUrl)
  const [linkStatus, setLinkStatus] = useState<LinkStatus | "">(citation.linkStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/citations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citationId: citation.id, linkUrl, linkStatus }),
      })
      const body = (await res.json().catch(() => null)) as { citation?: CitationDTO; error?: string } | null
      if (!res.ok || !body?.citation) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      toast.success(`${citation.source.name}: ${LINK_STATUS_LABEL[body.citation.linkStatus || "none"]}`)
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
        <DialogDescription>Create the profile or post on {citation.source.name} with a link to the client&apos;s website, then record the page it lives on.</DialogDescription>
      </header>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-url`}>Link URL</Label>
        <Input id={`${id}-url`} type="url" inputMode="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="The page that links to the client's website" />
        <p className="text-xs text-muted-foreground">Leave empty if the link hasn&apos;t been created yet.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-status`}>Link status</Label>
        <Select id={`${id}-status`} value={linkStatus} onChange={(e) => setLinkStatus(e.target.value as LinkStatus | "")}>
          <option value="">{LINK_STATUS_LABEL.none}</option>
          {LINK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LINK_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">Adding a URL with no status saves it as Pending. Use Check link in the table to confirm the page loads.</p>
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
