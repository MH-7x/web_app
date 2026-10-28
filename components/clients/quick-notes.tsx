"use client"

import { Pin, PinOff, Plus, StickyNote, X } from "lucide-react"
import { useId, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/input"
import { MAX_NOTE_LENGTH, type QuickNote } from "@/lib/client-notes-types"
import { cn } from "@/lib/utils"

type Change = { action: "add"; text: string } | { action: "pin"; id: string } | { action: "delete"; id: string }

/** "Oct 25 at 3:14 PM" in the viewer's time zone. */
function stamp(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
}

const TOKEN = /(\*\*[^*\n]+\*\*|https?:\/\/[^\s<]+)/g

/** **bold** and bare http(s) links, as React nodes: never raw HTML. */
function Formatted({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKEN).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
        if (/^https?:\/\//.test(part)) {
          const url = part.replace(/[.,;:!?)]+$/, "")
          return (
            <span key={i}>
              <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
                {url}
              </a>
              {part.slice(url.length)}
            </span>
          )
        }
        return part
      })}
    </>
  )
}

/**
 * Sticky notes for one client. A drawer on the right edge of the client page, so it stays reachable on every tab.
 * The server owns the order (pinned first, newest first), so every change just takes the list it sends back.
 */
export function QuickNotes({ clientId, initialNotes }: { clientId: string; initialNotes: QuickNote[] }) {
  const [notes, setNotes] = useState(initialNotes)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const panelId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  async function send(change: Change) {
    setBusy(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      })
      const data = (await res.json().catch(() => ({}))) as { notes?: QuickNote[]; error?: string }
      if (!res.ok || !data.notes) {
        toast.error(data.error ?? "Couldn't update the notes. Please try again.")
        return false
      }
      setNotes(data.notes)
      return true
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.")
      return false
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    const text = draft.trim()
    if (!text || busy) return
    if (await send({ action: "add", text })) {
      toast.success("Note added")
      setDraft("")
      inputRef.current?.focus()
    }
  }

  const pinned = notes.filter((n) => n.pinned).length

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed top-1/2 right-0 z-40 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-xl bg-card px-2 py-3 text-xs font-medium shadow-md ring-1 ring-foreground/10 transition-colors hover:bg-muted",
          open && "hidden"
        )}
      >
        <StickyNote className="size-4 text-muted-foreground" />
        <span className="[writing-mode:vertical-rl]">Notes</span>
        {notes.length > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground tabular-nums">{notes.length}</span>}
      </button>

      {open && (
        <aside
          id={panelId}
          aria-label="Quick notes"
          className="fixed top-[4.5rem] right-4 bottom-4 z-40 flex w-[min(22rem,calc(100vw-2rem))] flex-col rounded-xl bg-card shadow-xl ring-1 ring-foreground/10"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <StickyNote className="size-4 text-muted-foreground" /> Quick Notes
              {notes.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  {notes.length}
                  {pinned > 0 && ` · ${pinned} pinned`}
                </span>
              )}
            </h2>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close notes" onClick={() => setOpen(false)}>
              <X />
            </Button>
          </header>

          <div className="space-y-2 border-b border-border p-3">
            <Textarea
              ref={inputRef}
              aria-label="New note"
              value={draft}
              maxLength={MAX_NOTE_LENGTH}
              rows={2}
              placeholder="Add a note. Enter to save, Shift+Enter for a new line."
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void add()
                }
              }}
              className="min-h-16 resize-none"
            />
            <Button type="button" size="sm" className="w-full" disabled={busy || !draft.trim()} onClick={() => void add()}>
              <Plus /> Add
            </Button>
          </div>

          {notes.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No notes yet. Jot down client requests, deadlines and reminders.</p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {notes.map((note) => (
                <li key={note.id} className={cn("group space-y-1.5 px-4 py-3", note.pinned && "bg-primary/5")}>
                  <p dir="auto" className="text-sm break-words whitespace-pre-wrap">
                    <Formatted text={note.text} />
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <time dateTime={note.createdAt} className="text-xs text-muted-foreground">
                      {stamp(note.createdAt)}
                    </time>
                    <div className="flex gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={busy}
                        aria-label={note.pinned ? "Unpin note" : "Pin note"}
                        aria-pressed={note.pinned}
                        onClick={() => void send({ action: "pin", id: note.id })}
                        className={note.pinned ? "text-primary" : "text-muted-foreground"}
                      >
                        {note.pinned ? <PinOff /> : <Pin />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={busy}
                        aria-label="Delete note"
                        onClick={() => void send({ action: "delete", id: note.id })}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}
    </>
  )
}
