"use client"

import { Download, FileSpreadsheet, Loader2, TriangleAlert } from "lucide-react"
import { useId, useRef, useState } from "react"
import { toast } from "sonner"

import { ErrorNote } from "@/components/content/parts"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Label, Select } from "@/components/ui/input"
import { IMPORT_HEADERS, MAX_IMPORT_ROWS, type ImportPreview } from "@/lib/reviews-types"
import { cn } from "@/lib/utils"

type ClientOption = { id: string; name: string }

/** "2026-10-28" -> "28/10/2026", the format the file uses. */
const dmy = (day: string) => day.split("-").reverse().join("/")

/** Pick a client and a CSV or Excel file, check it, then import. The preview is a dry run: nothing is saved until Import is clicked. */
export function BulkUpload({ clients, defaultClientId, onDone, onClose }: { clients: ClientOption[]; defaultClientId: string; onDone: () => void; onClose: () => void }) {
  const id = useId()
  const [clientId, setClientId] = useState(defaultClientId || (clients.length === 1 ? clients[0].id : ""))
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [checking, setChecking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  /** only the newest preview request may update the screen */
  const latest = useRef(0)

  async function check(nextFile: File | null, nextClient: string) {
    const request = ++latest.current
    setPreview(null)
    setError(null)
    if (!nextFile || !nextClient) {
      setChecking(false)
      return
    }
    setChecking(true)
    try {
      const form = new FormData()
      form.set("clientId", nextClient)
      form.set("file", nextFile)
      form.set("preview", "1")
      const res = await fetch("/api/reviews/import", { method: "POST", body: form })
      const body = (await res.json().catch(() => null)) as (ImportPreview & { error?: string }) | null
      if (request !== latest.current) return
      if (!res.ok || !body) setError(body?.error ?? `Request failed (${res.status}).`)
      else setPreview(body)
    } catch {
      if (request === latest.current) setError("Could not reach the server. Check your connection and try again.")
    } finally {
      if (request === latest.current) setChecking(false)
    }
  }

  function pickFile(next: File | null) {
    setFile(next)
    void check(next, clientId)
  }

  function pickClient(next: string) {
    setClientId(next)
    // duplicates are checked per client, so the same file needs checking again
    void check(file, next)
  }

  async function runImport() {
    if (!file || !clientId || !preview) return
    setImporting(true)
    setError(null)
    try {
      const form = new FormData()
      form.set("clientId", clientId)
      form.set("file", file)
      const res = await fetch("/api/reviews/import", { method: "POST", body: form })
      const body = (await res.json().catch(() => null)) as { added?: number; duplicates?: number; problemCount?: number; error?: string } | null
      if (!res.ok || body?.added === undefined) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      const notes = [body.duplicates ? `${body.duplicates} already imported` : "", body.problemCount ? `${body.problemCount} skipped with problems` : ""].filter(Boolean)
      toast.success(`${body.added} ${body.added === 1 ? "review" : "reviews"} imported`, { description: notes.join(", ") || undefined })
      onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.")
      setImporting(false)
    }
  }

  const busy = checking || importing

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-client`}>Client</Label>
        <Select id={`${id}-client`} value={clientId} onChange={(e) => pickClient(e.target.value)} disabled={busy}>
          <option value="" disabled>
            Select a client
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">Every review in the file is added to this client.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-file`}>File</Label>
        <label
          htmlFor={`${id}-file`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (!busy) pickFile(e.dataTransfer.files[0] ?? null)
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-6 text-center transition-colors hover:bg-muted has-focus-visible:ring-2 has-focus-visible:ring-ring",
            dragging && "border-primary bg-primary/5",
            busy && "pointer-events-none opacity-60"
          )}
        >
          <FileSpreadsheet className="size-6 text-muted-foreground" />
          <span className="text-sm font-medium">{file ? file.name : "Choose a CSV or Excel file, or drop it here"}</span>
          <span className="text-xs text-muted-foreground">.csv, .xlsx or .xls, up to {MAX_IMPORT_ROWS} reviews</span>
          <input id={`${id}-file`} type="file" accept=".csv,.xlsx" className="sr-only" disabled={busy} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <p>
            Columns, in a header row: <span className="font-medium text-foreground">{IMPORT_HEADERS.join(", ")}</span>. Rating is a number from 1 to 5, and Date is{" "}
            <span className="font-medium text-foreground">DD/MM/YYYY</span> (28/10/2026). Review can be empty.
          </p>
          <a href="/api/reviews/import/template" download className="mt-1.5 inline-flex items-center gap-1 font-medium text-primary hover:underline">
            <Download className="size-3.5" /> Download template
          </a>
        </div>
      </div>

      {checking && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Checking the file…
        </p>
      )}
      {error && <ErrorNote message={error} />}
      {!clientId && file && !checking && <p className="text-sm text-muted-foreground">Choose a client to check the file.</p>}

      {preview && <PreviewPanel preview={preview} />}

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={importing}>
          Cancel
        </Button>
        <Button type="button" size="lg" onClick={runImport} disabled={busy || !preview || preview.willAdd === 0}>
          {importing && <Loader2 className="animate-spin" />}
          {preview && preview.willAdd > 0 ? `Import ${preview.willAdd} ${preview.willAdd === 1 ? "review" : "reviews"}` : "Import"}
        </Button>
      </DialogFooter>
    </div>
  )
}

function Chip({ tone, children }: { tone: "good" | "muted" | "bad"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-md px-2 py-1 text-xs font-medium tabular-nums",
        tone === "good" && "bg-primary/10 text-primary",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "bad" && "bg-destructive/10 text-destructive"
      )}
    >
      {children}
    </span>
  )
}

function PreviewPanel({ preview }: { preview: ImportPreview }) {
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap gap-2">
        <Chip tone="good">{preview.willAdd} will be added</Chip>
        {preview.duplicates > 0 && <Chip tone="muted">{preview.duplicates} already imported, skipped</Chip>}
        {preview.problemCount > 0 && <Chip tone="bad">{preview.problemCount} with problems, skipped</Chip>}
        <Chip tone="muted">{preview.total} rows in file</Chip>
      </div>

      {preview.sample.length > 0 && (
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Row</th>
                <th className="px-3 py-2 font-medium">Reviewer</th>
                <th className="px-3 py-2 font-medium">Rating</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Review</th>
              </tr>
            </thead>
            <tbody>
              {preview.sample.map((r) => (
                <tr key={r.row} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{r.row}</td>
                  <td dir="auto" className="px-3 py-2 font-medium">
                    {r.authorName}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.rating}★</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{dmy(r.date)}</td>
                  <td dir="auto" className="max-w-56 truncate px-3 py-2 text-muted-foreground" title={r.text}>
                    {r.text || "No text"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.willAdd > preview.sample.length && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">…and {preview.willAdd - preview.sample.length} more</p>}
        </div>
      )}

      {preview.problemCount > 0 && (
        <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
          <p className="flex items-center gap-1.5 font-medium">
            <TriangleAlert className="size-3.5" /> These rows won&apos;t be imported. Fix them in the file and upload again, or import the rest.
          </p>
          <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto">
            {preview.problems.map((p) => (
              <li key={p.row}>
                <span className="font-medium tabular-nums">Row {p.row}:</span> {p.message}
              </li>
            ))}
            {preview.problemCount > preview.problems.length && <li>…and {preview.problemCount - preview.problems.length} more.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
