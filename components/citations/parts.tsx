import { Check, Minus, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { LINK_STATUS_LABEL, STATUS_LABEL, isListed, matchOf, tracksField, MATCH_LABEL, type CitationDTO, type CitationStatus, type LinkStatus, type MatchField } from "@/lib/citations-types"
import { CATEGORY_INFO, isCategory } from "@/lib/constants"
import { cn } from "@/lib/utils"

const STATUS_VARIANT: Record<CitationStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  unchecked: "muted",
  listed: "success",
  not_listed: "outline",
  issues_found: "destructive",
}

export function StatusBadge({ status }: { status: CitationStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
}

const LINK_VARIANT: Record<LinkStatus | "none", React.ComponentProps<typeof Badge>["variant"]> = { none: "outline", pending: "muted", live: "success", dead: "destructive" }

export function LinkStatusBadge({ status }: { status: LinkStatus | "" }) {
  const key = status || "none"
  return <Badge variant={LINK_VARIANT[key]}>{LINK_STATUS_LABEL[key]}</Badge>
}

/** Text colour for a NAP score, keyed by `scoreTone`. */
export const TONE_CLASS = {
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
  none: "text-muted-foreground",
} as const

const PRIORITY_VARIANT: Record<string, React.ComponentProps<typeof Badge>["variant"]> = { high: "default", medium: "muted", low: "outline" }

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge variant={PRIORITY_VARIANT[priority] ?? "muted"} className="capitalize">
      {priority}
    </Badge>
  )
}

/** A tick, a cross, or a dash when there is nothing to compare (not listed yet, or the directory doesn't take that field). */
export function MatchCell({ citation, field }: { citation: CitationDTO; field: MatchField }) {
  if (!isListed(citation) || !tracksField(citation.source, field)) {
    return (
      <span title={isListed(citation) ? `${MATCH_LABEL[field]} isn't on this directory` : "Not listed"}>
        <Minus aria-hidden className="mx-auto size-4 text-muted-foreground/50" />
        <span className="sr-only">Not applicable</span>
      </span>
    )
  }
  const ok = matchOf(citation, field)
  return (
    <span title={ok ? "Matches" : "Doesn't match"}>
      {ok ? <Check aria-hidden className="mx-auto size-4 text-emerald-600 dark:text-emerald-400" /> : <X aria-hidden className="mx-auto size-4 text-destructive" />}
      <span className="sr-only">{ok ? "Matches" : "Doesn't match"}</span>
    </span>
  )
}

/** "28 Oct", in Dubai time so the server and the browser print the same thing. */
export const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" }) : "Never")

/** Who a directory is for: "All" or the client categories it applies to. */
export function RelevantTags({ relevantFor }: { relevantFor: string[] }) {
  const labels = relevantFor.includes("all") || relevantFor.length === 0 ? ["All"] : relevantFor.map((c) => (isCategory(c) ? CATEGORY_INFO[c].short : c))
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <Badge key={l} variant="outline" className="font-normal">
          {l}
        </Badge>
      ))}
    </span>
  )
}

export function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground tabular-nums", className)}>{children}</span>
}
