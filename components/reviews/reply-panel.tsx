"use client"

import { CheckCircle2, Loader2, Save, Sparkles, Trash2, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ErrorNote } from "@/components/content/parts"
import { CopyButton } from "@/components/copy-button"
import { CategoryBadge } from "@/components/category-badge"
import { Avatar, LanguageTag, ReplyStatusBadge, Stars } from "@/components/reviews/parts"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/input"
import { MAX_REPLY_LENGTH, type ReplyStatus, type ReviewDTO } from "@/lib/reviews-types"

type ReplyPatch = { replyStatus: ReplyStatus; replyDraft: string; repliedAt: string | null }
type Busy = "draft" | "save" | "replied" | "delete" | null

async function callReply<T>(id: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/reviews/${id}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !body) throw new Error(body?.error ?? `Request failed (${res.status}).`)
  return body
}

/** The side panel for one review: read it, draft a reply with Gemini, edit it, copy it into Google, mark it done. */
export function ReplyPanel({
  review,
  onChange,
  onDelete,
  onClose,
}: {
  review: ReviewDTO
  onChange: (id: string, patch: ReplyPatch) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState(review.replyDraft)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)

  const trimmed = text.trim()
  const dirty = trimmed !== review.replyDraft.trim()

  async function run<T>(kind: Exclude<Busy, null>, work: () => Promise<T>) {
    setBusy(kind)
    setError(null)
    try {
      return await work()
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setError(message)
      toast.error("Couldn't complete that", { description: message })
      return undefined
    } finally {
      setBusy(null)
    }
  }

  async function draft() {
    await run("draft", async () => {
      const { text: next } = await callReply<{ text: string }>(review.id, { action: "draft" })
      setText(next)
      // keep the draft so it is still there when the panel is reopened
      onChange(review.id, await callReply<ReplyPatch>(review.id, { action: "save", text: next }))
      toast.success("Reply drafted", { description: "Edit it if you like, then copy it into Google." })
    })
  }

  async function save() {
    await run("save", async () => {
      onChange(review.id, await callReply<ReplyPatch>(review.id, { action: "save", text: trimmed }))
      toast.success("Draft saved")
    })
  }

  async function remove() {
    if (!window.confirm(`Delete this review from ${review.authorName}? Only the copy in this dashboard is removed; the review on Google stays.`)) return
    await run("delete", async () => {
      const res = await fetch(`/api/reviews/${review.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`Request failed (${res.status}).`)
      toast.success("Review deleted")
      onDelete(review.id)
    })
  }

  async function markReplied() {
    await run("replied", async () => {
      onChange(review.id, await callReply<ReplyPatch>(review.id, { action: "mark_replied", text: trimmed }))
      toast.success("Marked as replied")
    })
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={review.authorName} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{review.authorName}</p>
            <p className="text-xs text-muted-foreground">{review.dateLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={remove} disabled={busy !== null} aria-label="Delete review" title="Delete review" className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
            {busy === "delete" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </button>
          <button type="button" onClick={onClose} aria-label="Close panel" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      </header>

      <section aria-label="Review" className="space-y-2 rounded-lg bg-muted/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Stars rating={review.rating} />
          <CategoryBadge category={review.clientCategory} label={review.clientName} />
          <LanguageTag language={review.language} />
          <ReplyStatusBadge status={review.replyStatus} rating={review.rating} />
        </div>
        <p dir="auto" className="text-sm leading-relaxed whitespace-pre-line">
          {review.text || <span className="text-muted-foreground italic">The customer left a star rating without any text.</span>}
        </p>
      </section>

      <section aria-label="Your reply" className="flex flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Your reply</h3>
          <Button type="button" size="sm" onClick={draft} disabled={busy !== null}>
            {busy === "draft" ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy === "draft" ? "Drafting…" : trimmed ? "Redraft" : "Draft Reply"}
          </Button>
        </div>

        <Textarea
          dir="auto"
          aria-label="Reply text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_REPLY_LENGTH}
          rows={10}
          placeholder="Click Draft Reply to have Gemini write one, or type your own."
          className="min-h-48 flex-1 leading-relaxed"
        />
        <p className="-mt-1 text-xs text-muted-foreground">Google has no reply API without OAuth, so copy the reply and paste it into the review in your Business Profile.</p>

        {error && <ErrorNote message={error} />}

        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={trimmed} label="Copy Reply" />
          <Button type="button" variant="outline" size="sm" onClick={save} disabled={busy !== null || !trimmed || !dirty}>
            {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save Draft
          </Button>
          <Button type="button" size="sm" className="ml-auto" onClick={markReplied} disabled={busy !== null || review.replyStatus === "replied"}>
            {busy === "replied" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {review.replyStatus === "replied" ? "Replied" : "Mark as Replied"}
          </Button>
        </div>
      </section>
    </div>
  )
}
