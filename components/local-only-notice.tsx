import { Laptop } from "lucide-react"
import type { ReactNode } from "react"

/** Shown on the live site in place of a feature that only runs from the app on your own computer (see lib/live.ts). */
export function LocalOnlyNotice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="note" className="flex items-start gap-3 rounded-xl bg-muted/60 px-4 py-4 text-sm ring-1 ring-foreground/10">
      <Laptop className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">{title} runs from the app on your computer</p>
        <p className="text-muted-foreground">
          It needs a browser or a long-running server, which this live site does not have. Start the app on your computer to run it: whatever it saves appears here too, because both use the same database.
        </p>
        {children}
      </div>
    </div>
  )
}
