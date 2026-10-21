import * as React from "react"

import { cn } from "@/lib/utils"

const fieldBase =
  "w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30"

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(fieldBase, "h-9", className)} {...props} />
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(fieldBase, "min-h-24 py-2", className)} {...props} />
}

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select data-slot="select" className={cn(fieldBase, "h-9 appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  )
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="label" className={cn("text-sm font-medium", className)} {...props} />
}

export { Input, Textarea, Select, Label, fieldBase }
