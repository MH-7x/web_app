import { Star } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { REPLY_STATUS_LABEL, type ReplyStatus } from "@/lib/reviews-types"
import { cn } from "@/lib/utils"

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={cn("size-4", n <= rating ? "fill-amber-400 text-amber-400" : "fill-transparent text-muted-foreground/40")} />
      ))}
    </span>
  )
}

const STATUS_VARIANT: Record<ReplyStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  none: "destructive",
  drafted: "default",
  replied: "success",
}

/** "No reply" is red only for negative reviews; a positive review nobody has answered yet is just muted. */
export function ReplyStatusBadge({ status, rating }: { status: ReplyStatus; rating: number }) {
  const variant = status === "none" && rating > 3 ? "muted" : STATUS_VARIANT[status]
  return <Badge variant={variant}>{REPLY_STATUS_LABEL[status]}</Badge>
}

export function LanguageTag({ language }: { language: string }) {
  return (
    <Badge variant="outline" className="font-mono text-[10px] tracking-wide uppercase" title={language === "ar" ? "Arabic" : language === "en" ? "English" : language.toUpperCase()}>
      {language.slice(0, 2)}
    </Badge>
  )
}

/** Initials in a circle: Places API reviews arrive with a photo URL we don't store. */
export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase() ?? "")
    .join("")
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {initials || "?"}
    </span>
  )
}
