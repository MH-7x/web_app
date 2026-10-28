"use client"

import { Check, Loader2, RefreshCw, Save, Wand2 } from "lucide-react"
import { useMemo, useState } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { CopyButton } from "@/components/copy-button"
import { DiffPair, StrictnessToggle } from "@/components/humanizer/parts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/input"
import { isArabic } from "@/lib/format"
import { findPatterns } from "@/lib/humanizer-patterns"
import { PASTE_MAX_CHARS, type Strictness } from "@/lib/humanizer-types"

type Outcome = { original: string; humanized: string; beforeScore: number; afterScore: number; warnings: string[]; strictness: Strictness }

export function PasteMode({ clientId, strictness, onStrictness }: { clientId: string | null; strictness: Strictness; onStrictness: (s: Strictness) => void }) {
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle")

  async function run(source = text) {
    const input = source.trim()
    if (!input) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/humanizer/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, strictness }),
      })
      const body = (await res.json().catch(() => null)) as { humanized?: string; beforeScore?: number; afterScore?: number; warnings?: string[]; error?: string } | null
      if (!res.ok || typeof body?.humanized !== "string") throw new Error(body?.error ?? `Request failed (${res.status}).`)
      setOutcome({ original: input, humanized: body.humanized, beforeScore: body.beforeScore ?? 0, afterScore: body.afterScore ?? 0, warnings: body.warnings ?? [], strictness })
      setSave("idle")
      toast.success("Humanized", { description: `AI score ${body.beforeScore ?? 0} → ${body.afterScore ?? 0}` })
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setError(message)
      toast.error("Couldn't humanize", { description: message })
    } finally {
      setLoading(false)
    }
  }

  async function saveToHistory() {
    if (!outcome || !clientId) return
    setSave("saving")
    try {
      const res = await fetch("/api/humanizer/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, original: outcome.original, humanized: outcome.humanized, strictness: outcome.strictness, beforeScore: outcome.beforeScore, afterScore: outcome.afterScore }),
      })
      if (!res.ok) throw new Error()
      setSave("saved")
      toast.success("Saved to history")
    } catch {
      setSave("error")
      toast.error("Couldn't save to history. Try again.")
    }
  }

  const patterns = useMemo(() => (outcome ? findPatterns(outcome.original) : []), [outcome])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <StrictnessToggle value={strictness} onChange={onStrictness} disabled={loading} />
        <Button size="lg" onClick={() => run()} disabled={loading || !text.trim() || text.trim().length > PASTE_MAX_CHARS} className="h-10 px-5">
          {loading ? <Loader2 className="animate-spin" /> : <Wand2 />}
          {loading ? "Humanizing…" : "Humanize"}
        </Button>
        {text.trim().length > PASTE_MAX_CHARS && <span className="text-sm text-destructive">Over the {PASTE_MAX_CHARS.toLocaleString()} character limit.</span>}
      </div>

      <div className="space-y-1.5">
        <Textarea
          aria-label="Text to humanize"
          dir={isArabic(text) ? "rtl" : "ltr"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
          placeholder="Paste the text you want to make sound human: a GBP description, an FAQ answer, a blog section, an ad."
          className="field-sizing-content min-h-40 py-3 leading-relaxed"
        />
        <p className="text-right text-xs text-muted-foreground tabular-nums">{text.length.toLocaleString()} characters</p>
      </div>

      {error && <ErrorNote message={error} onRetry={() => run()} />}

      {outcome ? (
        <div className={loading ? "space-y-4 opacity-60" : "space-y-4"}>
          {patterns.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Tells found in the original:</span>
              {patterns.map((p) => (
                <Badge key={p.id} variant="muted" className="font-normal">
                  {p.label} ×{p.count}
                </Badge>
              ))}
            </div>
          )}
          <DiffPair before={outcome.original} after={outcome.humanized} beforeScore={outcome.beforeScore} afterScore={outcome.afterScore} />
          {outcome.warnings.length > 0 && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">Check before using: {outcome.warnings.join(" ")}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={outcome.humanized} label="Copy Humanized" />
            <Button variant="outline" size="sm" onClick={saveToHistory} disabled={!clientId || save === "saving" || save === "saved"} title={clientId ? undefined : "Select a client in the top bar to save to their history"}>
              {save === "saving" ? <Loader2 className="animate-spin" /> : save === "saved" ? <Check /> : <Save />}
              {save === "saved" ? "Saved to history" : "Save to History"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => run(outcome.original)} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : undefined} /> Regenerate
            </Button>
            {save === "error" && (
              <span role="alert" className="text-sm text-destructive">
                Couldn&apos;t save. Try again.
              </span>
            )}
            {!clientId && <span className="text-xs text-muted-foreground">Select a client in the top bar to save to history.</span>}
          </div>
          <p className="text-xs text-muted-foreground">AI scores estimate how machine-written the style reads. They are not the verdict of a real detector.</p>
        </div>
      ) : (
        !error && (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
            {loading ? <Loader2 className="size-6 animate-spin text-primary" /> : <Wand2 className="size-6 text-muted-foreground/60" />}
            <p className="max-w-sm text-sm text-muted-foreground">{loading ? "Rewriting and scoring. This takes a few seconds." : "Paste some text and pick a strictness level. You will see the original and the rewrite side by side with changes highlighted."}</p>
          </div>
        )
      )}
    </div>
  )
}
