"use client"

import { Check, CheckCircle2, Clock, Loader2, MapPin, Palette, Pencil, Phone, RefreshCw, Trash2, Undo2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { toast } from "sonner"
import { Counter, ErrorNote } from "@/components/content/parts"
import { CopyButton } from "@/components/copy-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label, Select, Textarea } from "@/components/ui/input"
import { PublishNowButton, ScheduleButton } from "@/components/gbp/publish-actions"
import { CTAS, GBP_POST_MAX, POST_TYPES, categoryLabel, longDayLabel, scheduleLabel, type PostDTO } from "@/lib/gbp-posts-types"
import { cn } from "@/lib/utils"

export const STATUS_STYLE: Record<string, { dot: string; badge: "success" | "default" | "muted"; label: string }> = {
  approved: { dot: "bg-sky-500", badge: "success", label: "Approved" },
  draft: { dot: "bg-amber-500", badge: "muted", label: "Draft" },
  published: { dot: "bg-emerald-600", badge: "default", label: "Published" },
}

export function PostDetail({
  post,
  clientName,
  phone,
  brandColor,
  gbpLocation,
  onDeleted,
}: {
  post: PostDTO
  clientName: string
  phone: string
  brandColor: string | null
  /** the connected listing's name, or null when the client has no Google Business Profile connection */
  gbpLocation: string | null
  onDeleted: () => void
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ textAr: post.textAr, textEn: post.textEn, imagePrompt: post.imagePrompt, cta: post.cta, imageUrl: post.imageUrl })
  const [busy, setBusy] = useState<null | "save" | "approve" | "regenerate" | "delete">(null)
  const [error, setError] = useState<string | null>(null)
  const status = STATUS_STYLE[post.status] ?? STATUS_STYLE.draft
  // once it is live on Google it can't be edited, regenerated or pulled back to draft from here
  const published = post.status === "published"

  async function call(kind: NonNullable<typeof busy>, url: string, init: RequestInit, after?: () => void) {
    setBusy(kind)
    setError(null)
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      after?.()
      router.refresh()
      toast.success({ save: "Post saved", approve: "Post approved", regenerate: "Post rewritten", delete: "Post deleted" }[kind])
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setError(message)
      toast.error("That didn't work", { description: message })
    } finally {
      setBusy(null)
    }
  }

  const patch = (body: object, after?: () => void) => call("save", `/api/gbp-posts/${post.id}`, { method: "PATCH", body: JSON.stringify(body) }, after)
  const hasAr = post.language !== "en"
  const hasEn = post.language !== "ar"
  const over = (hasAr && draft.textAr.length > GBP_POST_MAX) || (hasEn && draft.textEn.length > GBP_POST_MAX)
  // only send the languages this post actually has; the other one is empty on purpose
  const editBody = () => ({ ...(hasAr ? { textAr: draft.textAr } : {}), ...(hasEn ? { textEn: draft.textEn } : {}), imagePrompt: draft.imagePrompt, cta: draft.cta, imageUrl: draft.imageUrl })

  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Scheduled post: {longDayLabel(post.date)}</h2>
            <Badge variant="success">{POST_TYPES[post.postType] ?? post.postType}</Badge>
            <Badge variant={status.badge} className="gap-1.5">
              <span className={cn("size-1.5 rounded-full", status.dot)} /> {status.label}
            </Badge>
            <Badge variant="outline">{categoryLabel(post.category)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Publish time 10:30 AM GST</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => { setEditing(false); setDraft({ textAr: post.textAr, textEn: post.textEn, imagePrompt: post.imagePrompt, cta: post.cta, imageUrl: post.imageUrl }); setError(null) }} disabled={busy !== null}>
                <X /> Cancel
              </Button>
              <Button disabled={busy !== null || over} onClick={() => patch(editBody(), () => setEditing(false))}>
                {busy === "save" ? <Loader2 className="animate-spin" /> : <Check />} Save changes
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setDraft({ textAr: post.textAr, textEn: post.textEn, imagePrompt: post.imagePrompt, cta: post.cta, imageUrl: post.imageUrl }); setEditing(true) }} disabled={busy !== null || published}>
                <Pencil /> Edit Text
              </Button>
              <Button
                variant="outline"
                disabled={busy !== null || published}
                onClick={() => {
                  if (window.confirm("Replace this post with a new version? Your edits to it will be lost and it goes back to draft.")) void call("regenerate", `/api/gbp-posts/${post.id}/regenerate`, { method: "POST" })
                }}
              >
                <RefreshCw className={cn(busy === "regenerate" && "animate-spin")} /> {busy === "regenerate" ? "Regenerating…" : "Regenerate"}
              </Button>
              {post.status === "draft" ? (
                <Button disabled={busy !== null} onClick={() => patch({ status: "approved" })}>
                  {busy === "save" ? <Loader2 className="animate-spin" /> : <Check />} Approve Post
                </Button>
              ) : published ? null : (
                <Button variant="secondary" disabled={busy !== null} onClick={() => patch({ status: "draft" })}>
                  <Undo2 /> Back to draft
                </Button>
              )}
              {gbpLocation !== null && !published && (
                <>
                  <PublishNowButton post={post} locationName={gbpLocation} disabled={busy !== null} />
                  <ScheduleButton post={post} disabled={busy !== null} />
                </>
              )}
              <Button
                variant="destructive"
                size="icon"
                aria-label="Delete post"
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm("Delete this post? This cannot be undone.")) void call("delete", `/api/gbp-posts/${post.id}`, { method: "DELETE" }, onDeleted)
                }}
              >
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <ErrorNote message={error} />}

      {published && post.publishedAt ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-600/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4" /> Published to Google Business Profile on {scheduleLabel(post.publishedAt)}.
        </p>
      ) : (
        post.scheduledFor && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300">
            <Clock className="size-4" /> Scheduled for {scheduleLabel(post.scheduledFor)}.{gbpLocation !== null ? " Press Publish Now when the time comes." : ""}
          </p>
        )
      )}

      <div className={cn("grid gap-4", hasAr && hasEn && "xl:grid-cols-2")}>
        {hasAr && <VersionCard lang="ar" primary={hasEn} editing={editing} text={editing ? draft.textAr : post.textAr} keywords={post.keywords} onChange={(v) => setDraft((d) => ({ ...d, textAr: v }))} />}
        {hasEn && <VersionCard lang="en" primary={false} editing={editing} text={editing ? draft.textEn : post.textEn} keywords={post.keywords} onChange={(v) => setDraft((d) => ({ ...d, textEn: v }))} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-3 rounded-xl bg-muted/50 p-4">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Call to action</p>
          {editing ? (
            <div className="space-y-1.5">
              <Label htmlFor="post-cta" className="sr-only">
                Call to action
              </Label>
              <Select id="post-cta" value={draft.cta} onChange={(e) => setDraft((d) => ({ ...d, cta: e.target.value }))}>
                {Object.entries(CTAS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Phone className="size-5" />
              </span>
              <div>
                <p className="font-semibold">Action: {CTAS[post.cta]?.label ?? post.cta}</p>
                {post.cta === "call" && <p className="font-mono text-xs text-primary">{phone}</p>}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {post.cta === "call" ? `Directs callers straight to ${clientName}.` : post.cta === "book" ? "Sends people to your booking link on Google." : "Sends people to your website."}
          </p>
        </div>

        <div className="space-y-2 rounded-xl bg-muted/50 p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              <Palette className="size-3.5" /> AI image prompt
            </p>
            {!editing && post.imagePrompt && <CopyButton text={post.imagePrompt} label="Copy prompt" />}
          </div>
          {editing ? (
            <Textarea aria-label="Image prompt" value={draft.imagePrompt} onChange={(e) => setDraft((d) => ({ ...d, imagePrompt: e.target.value }))} className="field-sizing-content min-h-24" />
          ) : (
            <p className="rounded-lg bg-background p-3 text-sm text-muted-foreground italic">{post.imagePrompt || "No image prompt."}</p>
          )}
          {gbpLocation !== null && (
            <div className="space-y-1.5">
              <Label htmlFor="post-image-url" className="text-xs">
                Photo URL for Google (optional, public https link)
              </Label>
              {editing ? (
                <Input id="post-image-url" type="url" inputMode="url" placeholder="https://…" value={draft.imageUrl} onChange={(e) => setDraft((d) => ({ ...d, imageUrl: e.target.value }))} />
              ) : (
                <p className="truncate rounded-lg bg-background p-2 font-mono text-xs text-muted-foreground">{post.imageUrl || "No photo. The post goes out as text only."}</p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2 font-mono text-xs">
            <span className="rounded bg-background px-2 py-1">Aspect: 4:3 (GBP optimal)</span>
            {brandColor && (
              <span className="flex items-center gap-1.5 rounded bg-background px-2 py-1">
                <span className="size-3 rounded-full ring-1 ring-foreground/20" style={{ backgroundColor: brandColor }} /> Brand: {brandColor}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

function VersionCard({ lang, primary, editing, text, keywords, onChange }: { lang: "ar" | "en"; primary: boolean; editing: boolean; text: string; keywords: string[]; onChange: (v: string) => void }) {
  const ar = lang === "ar"
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-muted/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Badge variant={ar ? "default" : "muted"} lang={ar ? "ar" : undefined}>
          {ar ? (primary ? "النسخة العربية (الأساسية)" : "النسخة العربية") : "English version"}
        </Badge>
        <CopyButton text={text} label="Copy" />
      </div>
      {editing ? (
        <Textarea aria-label={ar ? "Arabic text" : "English text"} dir={ar ? "rtl" : "ltr"} lang={lang} value={text} onChange={(e) => onChange(e.target.value)} aria-invalid={text.length > GBP_POST_MAX} className="field-sizing-content min-h-40 leading-relaxed" />
      ) : (
        <p dir={ar ? "rtl" : "ltr"} lang={lang} className="flex-1 text-[15px] leading-relaxed whitespace-pre-wrap">
          {text}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5" dir="ltr">
          <MapPin className="size-3.5" /> {keywords.length ? keywords.join(", ") : "No keywords"}
        </span>
        <Counter value={text.length} max={GBP_POST_MAX} />
      </div>
    </div>
  )
}
