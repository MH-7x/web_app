"use client"

import { CalendarClock, Loader2, Send } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input, Label } from "@/components/ui/input"
import { CTAS, POST_TYPES, scheduleLabel, type PostDTO } from "@/lib/gbp-posts-types"

const DUBAI_OFFSET = 4 * 60 * 60 * 1000

/** ISO timestamp -> the "YYYY-MM-DDTHH:mm" a datetime-local input wants, in Dubai time like the rest of the calendar. */
const toInputValue = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + DUBAI_OFFSET).toISOString().slice(0, 16) : "")
/** The reverse: what the user typed is Dubai time. */
const fromInputValue = (value: string) => new Date(`${value}:00+04:00`).toISOString()

async function send(url: string, init: RequestInit) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init })
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`)
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.")

/** "Publish Now" with a confirmation that shows exactly what will go out. */
export function PublishNowButton({ post, locationName, disabled }: { post: PostDTO; locationName: string; disabled?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const both = post.language === "both"
  const [lang, setLang] = useState<"ar" | "en">(post.language === "en" ? "en" : "ar")
  const text = lang === "ar" ? post.textAr : post.textEn

  async function publish() {
    setBusy(true)
    setError(null)
    try {
      await send("/api/gbp-posts/publish", { method: "POST", body: JSON.stringify({ id: post.id, lang }) })
      toast.success("Published to Google Business Profile")
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger render={<Button disabled={disabled} />}>
        <Send /> Publish Now
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Publish to Google Business Profile?</DialogTitle>
        <DialogDescription>
          This goes live on {locationName || "the connected listing"} straight away. It can&apos;t be undone from here; delete it in Google Business Profile.
        </DialogDescription>

        {both && (
          <div className="mt-4 flex gap-2" role="group" aria-label="Language to publish">
            {(["ar", "en"] as const).map((l) => (
              <Button key={l} type="button" size="sm" variant={lang === l ? "default" : "outline"} aria-pressed={lang === l} onClick={() => setLang(l)}>
                {l === "ar" ? "Arabic version" : "English version"}
              </Button>
            ))}
          </div>
        )}
        {both && <p className="mt-2 text-xs text-muted-foreground">Google posts are one language each, so only the selected version is published.</p>}

        <div className="mt-4 space-y-3 rounded-xl bg-muted/50 p-4">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-background px-2 py-1">{POST_TYPES[post.postType] ?? post.postType}</span>
            <span className="rounded bg-background px-2 py-1">Button: {CTAS[post.cta]?.label ?? post.cta}</span>
          </div>
          {post.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- an arbitrary user-supplied URL, shown only as a preview
            <img src={post.imageUrl} alt="" loading="lazy" className="max-h-40 w-full rounded-lg object-cover" />
          )}
          <p dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="max-h-60 overflow-y-auto text-[15px] leading-relaxed whitespace-pre-wrap">
            {text}
          </p>
        </div>

        {error && (
          <div className="mt-4">
            <ErrorNote message={error} />
          </div>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="lg" disabled={busy} />}>Cancel</DialogClose>
          <Button size="lg" onClick={publish} disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />} {busy ? "Publishing…" : "Publish now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "Schedule": pick a date and time, saved on the post. Publishing at that time is still done by hand. */
export function ScheduleButton({ post, disabled }: { post: PostDTO; disabled?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [value, setValue] = useState(toInputValue(post.scheduledFor))

  async function save(scheduledFor: string | null) {
    setBusy(true)
    setError(null)
    try {
      await send(`/api/gbp-posts/${post.id}`, { method: "PATCH", body: JSON.stringify({ scheduledFor }) })
      toast.success(scheduledFor ? `Scheduled for ${scheduleLabel(scheduledFor)}` : "Schedule cleared")
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (next) setValue(toInputValue(post.scheduledFor))
        setOpen(next)
      }}
    >
      <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        <CalendarClock /> {post.scheduledFor ? "Reschedule" : "Schedule"}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Schedule this post</DialogTitle>
        <DialogDescription>Pick when it should go out (Dubai time). Posts are not sent automatically yet: the calendar shows the time and you press Publish Now when it arrives.</DialogDescription>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="schedule-at">Date and time</Label>
          <Input id="schedule-at" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        {error && (
          <div className="mt-4">
            <ErrorNote message={error} />
          </div>
        )}
        <DialogFooter className="justify-between">
          {post.scheduledFor ? (
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => save(null)}>
              Clear schedule
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <DialogClose render={<Button variant="outline" size="lg" disabled={busy} />}>Cancel</DialogClose>
            <Button size="lg" disabled={busy || !value} onClick={() => save(fromInputValue(value))}>
              {busy ? <Loader2 className="animate-spin" /> : <CalendarClock />} Save schedule
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
