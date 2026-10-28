"use client"

import { Download, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Markdown } from "@/components/content/markdown"
import { ErrorNote } from "@/components/content/parts"
import { CopyButton } from "@/components/copy-button"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { downloadFile } from "@/lib/download"
import { slugify } from "@/lib/client-schema"

/** The citation report for a client meeting, written when the dialog opens from the client's current data. */
export function ReportDialog({ clientId, clientName, open, onClose }: { clientId: string; clientName: string; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl">{open && <Body clientId={clientId} clientName={clientName} onClose={onClose} />}</DialogContent>
    </Dialog>
  )
}

function Body({ clientId, clientName, onClose }: { clientId: string; clientName: string; onClose: () => void }) {
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** bumped by "Try again" to run the request once more */
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let stale = false
    fetch(`/api/clients/${clientId}/citations/report`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { markdown?: string; error?: string } | null
        if (stale) return
        if (!res.ok || !body?.markdown) setError(body?.error ?? `Request failed (${res.status}).`)
        else setMarkdown(body.markdown)
      })
      .catch(() => !stale && setError("Could not reach the server. Check your connection and try again."))
    return () => {
      stale = true
    }
  }, [clientId, attempt])

  return (
    <div className="space-y-4">
      <header>
        <DialogTitle>Citation report</DialogTitle>
        <DialogDescription>{clientName}. Copy it into an email or document, or download it as a Markdown file.</DialogDescription>
      </header>

      {error && (
        <ErrorNote
          message={error}
          onRetry={() => {
            setError(null)
            setAttempt((a) => a + 1)
          }}
        />
      )}
      {!markdown && !error && (
        <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Writing the report…
        </p>
      )}
      {markdown && (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto rounded-lg bg-muted/30 p-5 ring-1 ring-foreground/10">
          <Markdown source={markdown} />
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          Close
        </Button>
        {markdown && (
          <>
            <CopyButton text={markdown} label="Copy Markdown" />
            <Button type="button" size="lg" onClick={() => downloadFile(`citation-report-${slugify(clientName)}.md`, markdown, "text/markdown")}>
              <Download /> Download .md
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  )
}
