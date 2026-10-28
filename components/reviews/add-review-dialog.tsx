"use client"

import { Loader2, Plus, Star } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { ErrorNote } from "@/components/content/parts"
import { Button } from "@/components/ui/button"
import { BulkUpload } from "@/components/reviews/bulk-upload"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Input, Label, Select, Textarea } from "@/components/ui/input"
import { MAX_AUTHOR_NAME, MAX_REVIEW_TEXT, type ReviewDTO } from "@/lib/reviews-types"
import { cn } from "@/lib/utils"

type ClientOption = { id: string; name: string }

type Tab = "single" | "bulk"

const TABS: { id: Tab; label: string }[] = [
  { id: "single", label: "Single review" },
  { id: "bulk", label: "Bulk upload" },
]

/** The "Add Review" button and the dialog it opens: paste one review copied from Google, or upload a CSV or Excel file of many. */
export function AddReviewDialog({
  clients,
  defaultClientId,
  onAdded,
  onImported,
}: {
  clients: ClientOption[]
  defaultClientId: string
  onAdded: (id: string) => void
  onImported: () => void
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>("single")
  const id = useId()
  const close = () => setOpen(false)

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)} disabled={clients.length === 0}>
        <Plus /> Add Review
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setTab("single")
        }}
      >
        <DialogContent className="max-w-2xl">
          {/* mounted only while open, so every visit starts from a clean form; both tabs stay mounted so switching keeps what was typed */}
          {open && (
            <div className="space-y-4">
              <header>
                <DialogTitle>Add reviews</DialogTitle>
                <DialogDescription>Copy reviews from Google Maps or your Business Profile, then reply to them here.</DialogDescription>
              </header>

              <div role="tablist" aria-label="How to add reviews" className="flex gap-1 rounded-lg bg-muted p-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    id={`${id}-tab-${t.id}`}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    aria-controls={`${id}-panel-${t.id}`}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div role="tabpanel" id={`${id}-panel-single`} aria-labelledby={`${id}-tab-single`} hidden={tab !== "single"}>
                <AddReviewForm clients={clients} defaultClientId={defaultClientId} onClose={close} onAdded={onAdded} />
              </div>
              <div role="tabpanel" id={`${id}-panel-bulk`} aria-labelledby={`${id}-tab-bulk`} hidden={tab !== "bulk"}>
                <BulkUpload clients={clients} defaultClientId={defaultClientId} onDone={onImported} onClose={close} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function AddReviewForm({ clients, defaultClientId, onClose, onAdded }: { clients: ClientOption[]; defaultClientId: string; onClose: () => void; onAdded: (id: string) => void }) {
  const id = useId()
  const today = new Date().toLocaleDateString("en-CA") // YYYY-MM-DD in the user's own timezone
  const [clientId, setClientId] = useState(defaultClientId || (clients.length === 1 ? clients[0].id : ""))
  const [authorName, setAuthorName] = useState("")
  const [rating, setRating] = useState(0)
  const [date, setDate] = useState(today)
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) return setError("Choose a client.")
    if (!authorName.trim()) return setError("Enter the reviewer's name.")
    if (!rating) return setError("Choose a star rating.")
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, authorName, rating, text, date }) })
      const body = (await res.json().catch(() => null)) as { review?: ReviewDTO; error?: string } | null
      if (!res.ok || !body?.review) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      toast.success("Review added", { description: `${body.review.authorName}, ${body.review.rating}★` })
      onAdded(body.review.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-client`}>Client</Label>
          <Select id={`${id}-client`} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="" disabled>
              Select a client
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-date`}>Date posted</Label>
          <Input id={`${id}-date`} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-author`}>Reviewer name</Label>
          <Input id={`${id}-author`} dir="auto" value={authorName} maxLength={MAX_AUTHOR_NAME} onChange={(e) => setAuthorName(e.target.value)} placeholder="e.g. Omar Khalid" autoComplete="off" />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Rating</legend>
          <div role="radiogroup" aria-label="Star rating" className="flex h-9 items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
                onClick={() => setRating(n)}
                className="rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Star className={cn("size-6 transition-colors", n <= rating ? "fill-amber-400 text-amber-400" : "fill-transparent text-muted-foreground/40 hover:text-amber-400")} />
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-text`}>Review text</Label>
        <Textarea
          id={`${id}-text`}
          dir="auto"
          value={text}
          maxLength={MAX_REVIEW_TEXT}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste the review here. Leave empty for a star rating with no comment."
        />
      </div>

      {error && <ErrorNote message={error} />}

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} Add Review
        </Button>
      </DialogFooter>
    </form>
  )
}
