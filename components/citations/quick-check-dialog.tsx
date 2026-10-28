"use client"

import { ExternalLink, Loader2, Search } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ErrorNote } from "@/components/content/parts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"

type Check = { citationId: string; sourceName: string; searchUrl: string }

/** One Google search per directory not checked yet. Open them all as tabs, or one at a time, then record what you find. */
export function QuickCheckDialog({ clientId, clientName, open, onClose }: { clientId: string; clientName: string; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl">{open && <Body clientId={clientId} clientName={clientName} onClose={onClose} />}</DialogContent>
    </Dialog>
  )
}

function Body({ clientId, clientName, onClose }: { clientId: string; clientName: string; onClose: () => void }) {
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    fetch(`/api/clients/${clientId}/citations/quick-check`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { checks?: Check[]; error?: string } | null
        if (stale) return
        if (!res.ok || !body?.checks) setError(body?.error ?? `Request failed (${res.status}).`)
        else setChecks(body.checks)
      })
      .catch(() => !stale && setError("Could not reach the server. Check your connection and try again."))
    return () => {
      stale = true
    }
  }, [clientId])

  // runs inside the click, with the list already loaded, so the browser treats the tabs as opened by the user
  function openAll() {
    if (!checks) return
    const blocked = checks.filter((c) => !window.open(c.searchUrl, "_blank", "noopener")).length
    if (blocked > 0) toast.warning("Your browser blocked some tabs", { description: "Allow pop-ups for this site, or open the searches one at a time from the list." })
  }

  return (
    <div className="space-y-4">
      <header>
        <DialogTitle>Quick Check</DialogTitle>
        <DialogDescription>
          Searches Google for &ldquo;{clientName}&rdquo; on each directory that hasn&apos;t been checked yet. Look at the results, then use Update on the row to record what you found.
        </DialogDescription>
      </header>

      {error && <ErrorNote message={error} />}
      {!checks && !error && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Building the searches…
        </p>
      )}
      {checks && checks.length === 0 && <p className="rounded-lg bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">Every directory has been checked. Nothing left to search.</p>}
      {checks && checks.length > 0 && (
        <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg ring-1 ring-foreground/10">
          {checks.map((c) => (
            <li key={c.citationId}>
              <a href={c.searchUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted">
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 font-medium">{c.sourceName}</span>
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          Close
        </Button>
        <Button type="button" size="lg" onClick={openAll} disabled={!checks || checks.length === 0}>
          <ExternalLink /> Open all {checks && checks.length > 0 ? `${checks.length} ` : ""}tabs
        </Button>
      </DialogFooter>
    </div>
  )
}
