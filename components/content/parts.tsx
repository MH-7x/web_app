"use client"

import { Check, Download, Loader2, RefreshCw, Save, Sparkles, TriangleAlert, Undo2, Wand2 } from "lucide-react"
import { useState, type ReactNode } from "react"

import { CopyButton } from "@/components/copy-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { HumanizeInfo, SaveState } from "@/components/content/use-generator"
import { Select } from "@/components/ui/input"
import { STRICTNESS, type Strictness } from "@/lib/humanizer-types"
import { renderText, type ContentType, type Language, type ResultMap } from "@/lib/content-types"
import { cn } from "@/lib/utils"

export const TYPE_TITLES: Record<ContentType, string> = {
  gbp: "GBP Description",
  faq: "FAQ Generator",
  blog: "Blog Post",
  meta: "Meta Tags",
}

const LANGUAGE_OPTIONS: { value: Language; label: string; lang?: string }[] = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية", lang: "ar" },
  { value: "both", label: "Both (Dual)" },
]

export function LanguageToggle({ value, onChange, disabled }: { value: Language; onChange: (v: Language) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Output language" className="inline-flex rounded-lg bg-muted p-1">
      {LANGUAGE_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          lang={o.lang}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-50",
            value === o.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function GenerateButton({ loading, onClick, children, disabled }: { loading: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <Button type="button" size="lg" onClick={onClick} disabled={loading || disabled} className="h-10 px-4">
      {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {loading ? "Generating…" : children}
    </Button>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <p className="flex-1">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  )
}

export function Counter({ value, max, className }: { value: number; max: number; className?: string }) {
  const over = value > max
  return (
    <span className={cn("font-mono text-xs tabular-nums", over ? "font-semibold text-destructive" : "text-muted-foreground", className)}>
      {value} / {max}
    </span>
  )
}

/** Header + body card for one language's output. */
export function LangCard({
  lang,
  title,
  copyText,
  footer,
  children,
}: {
  lang: "en" | "ar"
  title: string
  copyText?: string
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="flex min-w-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Badge variant={lang === "ar" ? "default" : "muted"} lang={lang === "ar" ? "ar" : undefined}>
            {lang === "ar" ? "العربية" : "English"}
          </Badge>
          <span className="text-sm font-medium">{title}</span>
        </div>
        {copyText !== undefined && <CopyButton text={copyText} label="Copy" />}
      </div>
      <div className="flex-1 p-4">{children}</div>
      {footer && <div className="border-t border-border bg-muted/40 px-4 py-2">{footer}</div>}
    </Card>
  )
}

export function OutputPlaceholder({ loading, children, onGenerate, actionLabel = "Generate now" }: { loading: boolean; children: ReactNode; onGenerate?: () => void; actionLabel?: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted">
        {loading ? <Loader2 className="size-5 animate-spin text-primary" /> : <Sparkles className="size-5 text-muted-foreground" />}
      </span>
      <p className="mt-1 font-medium">{loading ? "Writing…" : "Nothing generated yet"}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{loading ? "Gemini is writing. This can take up to a minute for longer pieces." : children}</p>
      {!loading && onGenerate && (
        <Button type="button" onClick={onGenerate} className="mt-3">
          <Sparkles /> {actionLabel}
        </Button>
      )}
    </div>
  )
}

/** Shows `ar` before `en`, like the design. */
export function langsIn(result: { en?: unknown; ar?: unknown }): ("ar" | "en")[] {
  return (["ar", "en"] as const).filter((l) => result[l] !== undefined)
}

export const textDir = (lang: "en" | "ar") => (lang === "ar" ? "rtl" : "ltr")

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** What the Humanize button needs from useGenerator. */
export type HumanizerControl = {
  run: (strictness: Strictness) => Promise<void>
  undo: () => void
  busy: boolean
  error: string | null
  info: HumanizeInfo | null
}

export function ActionBar<T extends ContentType>({
  type,
  result,
  clientName,
  clientSlug,
  dirty,
  saveState,
  loading,
  onSave,
  onRegenerate,
  humanize,
}: {
  type: T
  result: ResultMap[T]
  clientName: string
  clientSlug: string
  dirty: boolean
  saveState: SaveState
  loading: boolean
  onSave: () => void
  onRegenerate: () => void
  humanize?: HumanizerControl
}) {
  const [strictness, setStrictness] = useState<Strictness>("medium")
  const text = (lang: "en" | "ar") => (result[lang] === undefined ? undefined : renderText(type, result[lang] as never))
  const en = text("en")
  const ar = text("ar")

  function exportMarkdown() {
    const parts = [`# ${TYPE_TITLES[type]}: ${clientName}`]
    if (en !== undefined) parts.push(`## English\n\n${en}`)
    if (ar !== undefined) parts.push(`## العربية\n\n${ar}`)
    download(`${clientSlug}-${type}.md`, parts.join("\n\n") + "\n")
  }

  const saved = !dirty && saveState !== "saving"

  return (
    <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      {en !== undefined && <CopyButton text={en} label="Copy English" />}
      {ar !== undefined && <CopyButton text={ar} label="Copy Arabic" />}
      <Button type="button" variant="outline" size="sm" onClick={onSave} disabled={!dirty || saveState === "saving"}>
        {saveState === "saving" ? <Loader2 className="animate-spin" /> : saved ? <Check /> : <Save />}
        {saveState === "saving" ? "Saving…" : saved ? "Saved to history" : "Save changes"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={exportMarkdown}>
        <Download /> Export Markdown
      </Button>
      {humanize && (
        <div className="flex items-center gap-1">
          <Select aria-label="Humanizer strictness" value={strictness} onChange={(e) => setStrictness(e.target.value as Strictness)} disabled={humanize.busy || loading} className="h-8 w-auto py-0 text-sm">
            {STRICTNESS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button type="button" size="sm" onClick={() => void humanize.run(strictness)} disabled={humanize.busy || loading} title="Rewrite this output so it reads as human-written">
            {humanize.busy ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {humanize.busy ? "Humanizing…" : "Humanize"}
          </Button>
        </div>
      )}
      <Button type="button" variant="secondary" size="sm" onClick={onRegenerate} disabled={loading}>
        <RefreshCw className={cn(loading && "animate-spin")} /> Regenerate
      </Button>
      {saveState === "error" && (
        <span role="alert" className="text-sm text-destructive">
          Couldn&apos;t save. Try again.
        </span>
      )}
    </div>
    {humanize?.error && <ErrorNote message={humanize.error} />}
    {humanize?.info && (
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-primary/5 px-4 py-2.5 text-sm">
        <Wand2 className="size-4 text-primary" />
        <span>
          Humanized {humanize.info.pieces} {humanize.info.pieces === 1 ? "piece" : "pieces"}. AI score{" "}
          <span className="font-semibold tabular-nums">{humanize.info.before}</span> → <span className="font-semibold tabular-nums">{humanize.info.after}</span>.
          {dirty && " Save changes to keep it."}
        </span>
        {humanize.info.warnings.length > 0 && <span className="text-xs text-amber-700 dark:text-amber-400">Check: {humanize.info.warnings.join(" ")}</span>}
        <button type="button" onClick={humanize.undo} className="ml-auto inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline">
          <Undo2 className="size-3.5" /> Undo
        </button>
      </div>
    )}
    </div>
  )
}

/** Confirm before throwing away unsaved edits. */
export function confirmDiscard(dirty: boolean) {
  return !dirty || window.confirm("You have unsaved edits that will be replaced. Generate anyway?")
}
