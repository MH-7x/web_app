import { Check } from "lucide-react"
import Link from "next/link"

import type { ChecklistProgress } from "@/lib/onboarding-checklist-types"
import { cn } from "@/lib/utils"

/** Onboarding progress for the clients list: a colored dot and percentage until the checklist is complete. */
export function SetupIndicator({ clientId, progress }: { clientId: string; progress: ChecklistProgress }) {
  if (progress.total === 0) return <span className="text-muted-foreground">—</span>

  if (progress.percent >= 100) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="size-3.5 text-primary" /> Complete
      </span>
    )
  }

  const dot = progress.percent < 34 ? "bg-destructive" : progress.percent < 67 ? "bg-amber-500" : "bg-primary"
  return (
    <Link
      href={`/clients/${clientId}?tab=onboarding`}
      title={`${progress.done} of ${progress.total} setup tasks done`}
      className="inline-flex items-center gap-1.5 text-sm tabular-nums hover:text-primary"
    >
      <span aria-hidden className={cn("size-2 rounded-full", dot)} />
      {progress.percent}%
      <span className="sr-only"> of onboarding complete</span>
    </Link>
  )
}
