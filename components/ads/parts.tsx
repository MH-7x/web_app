"use client"

import { Check, Download, Loader2, RefreshCw, Save } from "lucide-react"
import type { ReactNode } from "react"

import type { SaveState } from "@/components/content/use-generator"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Live character counter: green while within the limit, red once over it. */
export function LimitCounter({ value, max, className }: { value: number; max: number; className?: string }) {
  const over = value > max
  return (
    <span
      aria-label={`${value} of ${max} characters${over ? ", over the limit" : ""}`}
      className={cn("font-mono text-xs tabular-nums", over ? "font-semibold text-destructive" : "text-emerald-600 dark:text-emerald-400", className)}
    >
      {value}/{max}
    </span>
  )
}

export function BatchToggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-primary" : "bg-muted-foreground/30")}
      >
        <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform", checked && "translate-x-4")} />
      </button>
      Batch: All Emirates
    </label>
  )
}

export function AdsActionBar({
  dirty,
  saveState,
  loading,
  exportLabel,
  onExport,
  onSave,
  onRegenerate,
  children,
}: {
  dirty: boolean
  saveState: SaveState
  loading: boolean
  exportLabel: string
  onExport: () => void
  onSave: () => void
  onRegenerate: () => void
  children?: ReactNode
}) {
  const saved = !dirty && saveState !== "saving"
  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-card p-3 shadow-md ring-1 ring-foreground/10">
      <Button type="button" size="sm" onClick={onExport}>
        <Download /> {exportLabel}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onSave} disabled={!dirty || saveState === "saving"}>
        {saveState === "saving" ? <Loader2 className="animate-spin" /> : saved ? <Check /> : <Save />}
        {saveState === "saving" ? "Saving…" : saved ? "Saved to history" : "Save changes"}
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={onRegenerate} disabled={loading}>
        <RefreshCw className={cn(loading && "animate-spin")} /> Regenerate
      </Button>
      {children}
      {saveState === "error" && (
        <span role="alert" className="text-sm text-destructive">
          Couldn&apos;t save. Try again.
        </span>
      )}
    </div>
  )
}

export const langName = (l: "en" | "ar") => (l === "ar" ? "Arabic" : "English")
