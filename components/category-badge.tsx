import { Badge } from "@/components/ui/badge"
import { CATEGORY_INFO, type ClientCategory } from "@/lib/constants"
import { cn } from "@/lib/utils"

const TONE: Record<ClientCategory, string> = {
  moving: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  used_furniture: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  pickup_rental: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
}

/** `label` replaces the category name, e.g. to show a client's name in its category colour. */
export function CategoryBadge({ category, label, className }: { category: ClientCategory; label?: string; className?: string }) {
  return (
    <Badge variant="muted" className={cn(TONE[category], className)}>
      {label ?? CATEGORY_INFO[category].short}
    </Badge>
  )
}
