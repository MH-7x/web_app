import { Box, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"

import { Card } from "@/components/ui/card"

/** The branded frame for the login and setup pages: no sidebar, just the card on a soft teal wash. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_60%)] px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Box className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">UAE Marketing Hub</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle ?? title}</p>
          </div>
        </div>
        <Card className="p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold">{title}</h2>
          {children}
        </Card>
      </div>
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  )
}

export function PageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}
