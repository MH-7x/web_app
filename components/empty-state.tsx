import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** An empty module or list: what is missing, why, and the obvious next step (pass buttons or links as children). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  description: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center", className)}>
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="mt-1 font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {children && <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  )
}
