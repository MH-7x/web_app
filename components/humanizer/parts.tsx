"use client"

import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"
import { diffWords } from "@/lib/diff"
import { STRICTNESS, scoreTone, type Strictness } from "@/lib/humanizer-types"
import { cn } from "@/lib/utils"

const TONE_CLASS = {
  high: "bg-destructive/10 text-destructive",
  mid: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  low: "bg-chart-1/30 text-chart-5 dark:bg-chart-3/25 dark:text-chart-1",
} as const

export function ScoreBadge({ score, label, className }: { score: number; label?: string; className?: string }) {
  return (
    <Badge className={cn("font-mono tabular-nums", TONE_CLASS[scoreTone(score)], className)} title="Estimated AI-detection score, 0 to 100. Lower reads more human.">
      {label ? `${label}: ${score}` : score}
    </Badge>
  )
}

export function StrictnessToggle({ value, onChange, disabled }: { value: Strictness; onChange: (v: Strictness) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Strictness" className="flex gap-1.5">
      {STRICTNESS.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={value === s.id}
          title={s.hint}
          disabled={disabled}
          onClick={() => onChange(s.id)}
          className={cn(
            "h-8 rounded-lg px-3.5 text-sm font-medium ring-1 transition-colors disabled:opacity-50",
            value === s.id ? "bg-primary text-primary-foreground ring-primary" : "bg-background text-muted-foreground ring-border hover:text-foreground"
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

/** Original on the left, rewrite on the right, changed words highlighted in both. */
export function DiffPair({ before, after, beforeScore, afterScore }: { before: string; after: string; beforeScore: number; afterScore: number }) {
  const diff = useMemo(() => diffWords(before, after), [before, after])
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <DiffCard title="Original" score={beforeScore} pieces={diff.before} />
      <DiffCard title="Humanized" score={afterScore} pieces={diff.after} />
    </div>
  )
}

function DiffCard({ title, score, pieces }: { title: string; score: number; pieces: { text: string; changed: boolean }[] }) {
  return (
    <section className="min-w-0 space-y-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10" aria-label={title}>
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
        <ScoreBadge score={score} label="AI score" />
      </div>
      <p dir="auto" className="text-sm leading-relaxed whitespace-pre-wrap">
        {pieces.map((p, i) =>
          p.changed ? (
            <mark key={i} className="rounded-sm bg-amber-300/60 px-0.5 text-foreground dark:bg-amber-400/30">
              {p.text}
            </mark>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
      </p>
    </section>
  )
}
