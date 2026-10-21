import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary-foreground",
        muted: "bg-muted text-muted-foreground",
        outline: "border border-border text-foreground",
        destructive: "bg-destructive/10 text-destructive",
        success: "bg-chart-1/30 text-chart-5 dark:bg-chart-3/25 dark:text-chart-1",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
