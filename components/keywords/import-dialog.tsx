"use client"

import { Loader2, Upload } from "lucide-react"
import { useEffect, useState } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import type { KeywordRow } from "@/lib/keywords-types"

type Preview = { preview: KeywordRow[]; total: number; newCount: number; duplicateCount: number; unreadable: number }

/** Parses the chosen file on the server, shows the first 10 rows, and imports it into the group once confirmed. */
export function ImportDialog({ groupId, file, onClose, onImported }: { groupId: string; file: File | null; onClose: () => void; onImported: (keywords: KeywordRow[]) => void }) {
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">{file && <ImportBody groupId={groupId} file={file} onClose={onClose} onImported={onImported} />}</DialogContent>
    </Dialog>
  )
}

/** Mounted fresh for each chosen file, so its state always starts clean. */
function ImportBody({ groupId, file, onClose, onImported }: { groupId: string; file: File; onClose: () => void; onImported: (keywords: KeywordRow[]) => void }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "update">("skip")

  useEffect(() => {
    let stale = false
    const form = new FormData()
    form.set("file", file)
    form.set("preview", "1")
    fetch(`/api/keywords/${groupId}/import`, { method: "POST", body: form })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (Preview & { error?: string }) | null
        if (stale) return
        if (!res.ok || !body?.preview) setError(body?.error ?? `Request failed (${res.status}).`)
        else setPreview(body)
      })
      .catch(() => !stale && setError("Could not reach the server. Try again."))
    return () => {
      stale = true
    }
  }, [file, groupId])

  async function confirm() {
    setImporting(true)
    try {
      const form = new FormData()
      form.set("file", file)
      form.set("onDuplicate", onDuplicate)
      const res = await fetch(`/api/keywords/${groupId}/import`, { method: "POST", body: form })
      const body = (await res.json().catch(() => null)) as { keywords?: KeywordRow[]; added?: number; updated?: number; skipped?: number; error?: string } | null
      if (!res.ok || !body?.keywords) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      onImported(body.keywords)
      toast.success(`${body.added} ${body.added === 1 ? "keyword" : "keywords"} imported to group`, { description: [body.updated ? `${body.updated} updated` : "", body.skipped ? `${body.skipped} duplicates skipped` : ""].filter(Boolean).join(", ") || undefined })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
        <DialogTitle>Import keywords</DialogTitle>
        <DialogDescription>{file.name}</DialogDescription>

        <div className="mt-4 space-y-4">
          {error && <ErrorNote message={error} />}
          {!preview && !error && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Reading the file…
            </p>
          )}
          {preview && (
            <>
              <p className="text-sm">
                <strong>{preview.total.toLocaleString()}</strong> keywords found: <strong>{preview.newCount.toLocaleString()}</strong> new, <strong>{preview.duplicateCount.toLocaleString()}</strong> already in this group.
                {preview.unreadable > 0 && <span className="text-muted-foreground"> {preview.unreadable} blank or repeated rows in the file were ignored.</span>}
              </p>
              <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-[11px] tracking-wider text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2 font-medium">Keyword</th>
                      <th className="px-3 py-2 text-right font-medium">Searches</th>
                      <th className="px-3 py-2 text-right font-medium">3-Month</th>
                      <th className="px-3 py-2 font-medium">Competition</th>
                      <th className="px-3 py-2 text-right font-medium">Bid Low</th>
                      <th className="px-3 py-2 text-right font-medium">Bid High</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.preview.map((r) => (
                      <tr key={r.keyword}>
                        <td className="px-3 py-1.5" dir="auto">{r.keyword}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.avgMonthlySearches.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.threeMonthChange}</td>
                        <td className="px-3 py-1.5">{r.competition || "–"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.topOfPageBidLow.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.topOfPageBidHigh.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.total > 10 && <p className="text-xs text-muted-foreground">Showing the first 10 of {preview.total.toLocaleString()}.</p>}
              {preview.duplicateCount > 0 && (
                <fieldset className="flex flex-wrap gap-4 text-sm">
                  <legend className="sr-only">Keywords already in the group</legend>
                  {(["skip", "update"] as const).map((v) => (
                    <label key={v} className="flex cursor-pointer items-center gap-2">
                      <input type="radio" name="on-duplicate" checked={onDuplicate === v} onChange={() => setOnDuplicate(v)} className="accent-primary" />
                      {v === "skip" ? "Skip keywords already in the group" : "Update them with the file's numbers"}
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!preview || importing}>
            {importing ? <Loader2 className="animate-spin" /> : <Upload />} Import {preview ? preview.total.toLocaleString() : ""} keywords
          </Button>
        </DialogFooter>
    </>
  )
}
