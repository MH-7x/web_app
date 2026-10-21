import { cn } from "@/lib/utils"

export const scoreTone = (score: number) =>
  score >= 75
    ? { stroke: "stroke-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: score >= 85 ? "Healthy" : "Good" }
    : score >= 50
      ? { stroke: "stroke-amber-500", text: "text-amber-600 dark:text-amber-400", label: "Needs work" }
      : { stroke: "stroke-destructive", text: "text-destructive", label: "At risk" }

/** Circular 0-100 score indicator. A null score means "not graded" and shows a dash. */
export function ScoreRing({ score, size = 96, label, grade }: { score: number | null; size?: number; label: string; grade?: string | null }) {
  const stroke = Math.max(5, Math.round(size / 12))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const tone = score === null ? null : scoreTone(score)

  return (
    <div role="img" aria-label={score === null ? `${label}: not graded` : `${label}: ${score} out of 100${grade ? `, grade ${grade}` : ""}`} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        {score !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)}
            className={cn("transition-[stroke-dashoffset]", tone!.stroke)}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={cn("font-semibold tabular-nums", size >= 100 ? "text-3xl" : size >= 80 ? "text-2xl" : "text-xl")}>{score === null ? "–" : score}</span>
        {score !== null && grade ? <span className={cn("mt-0.5 text-xs font-semibold", tone!.text)}>{grade}</span> : <span className="mt-0.5 text-[10px] text-muted-foreground">{score === null ? "n/a" : "/100"}</span>}
      </div>
    </div>
  )
}
