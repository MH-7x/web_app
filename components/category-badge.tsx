import { Badge } from "@/components/ui/badge"
import { CATEGORY_INFO, type ClientCategory } from "@/lib/constants"
import { cn } from "@/lib/utils"

const TONE: Record<ClientCategory, string> = {
  moving: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  used_furniture: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  pickup_rental: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
}

export function CategoryBadge({ category, className }: { category: ClientCategory; className?: string }) {
  return (
    <Badge variant="muted" className={cn(TONE[category], className)}>
      {CATEGORY_INFO[category].short}
    </Badge>
  )
}
