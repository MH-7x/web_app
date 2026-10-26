import { cn } from "@/lib/utils"

/** Placeholder shapes shown while a page's data loads. Server-safe, no client JS. */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} />
}

function Panel({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div aria-hidden className={cn("animate-pulse rounded-xl bg-card ring-1 ring-foreground/10", className)}>
      {children}
    </div>
  )
}

const Wrap = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div role="status" aria-label="Loading" className={cn("mx-auto space-y-5", className)}>
    {children}
  </div>
)

/** A card holding a heading line and a few text lines. */
function TextPanel({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <Panel className={cn("space-y-3 p-5", className)}>
      <Skeleton className="h-4 w-1/3 bg-muted" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3 bg-muted", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </Panel>
  )
}

/** Content, Ads: client banner, tabs, then a setup card beside the output area. */
export function WorkspaceSkeleton() {
  return (
    <Wrap>
      <Panel className="h-14" />
      <Panel className="h-12" />
      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <Panel className="space-y-4 p-5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-4 w-1/3" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-6 w-24" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
        </Panel>
        <Panel className="min-h-80" />
      </div>
    </Wrap>
  )
}

export function DashboardSkeleton() {
  return (
    <Wrap className="max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-9 w-80" />
        </div>
        <Skeleton className="h-8 w-52" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Panel key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Panel key={i} className="h-16" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <TextPanel key={i} lines={4} className="h-56" />
        ))}
      </div>
      <TableSkeleton rows={6} />
    </Wrap>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Panel className="overflow-hidden">
      <div className="h-11 bg-muted/60" />
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <Skeleton className="h-3.5 w-1/4" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function ClientsSkeleton() {
  return (
    <Wrap className="max-w-6xl">
      <Panel className="h-[62px]" />
      <TableSkeleton rows={8} />
    </Wrap>
  )
}

export function ClientDetailSkeleton() {
  return (
    <Wrap className="max-w-6xl">
      <Panel className="flex items-center gap-5 p-6">
        <Skeleton className="size-16 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-3.5 w-80" />
        </div>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-3">
        <TextPanel lines={6} className="lg:col-span-2" />
        <TextPanel lines={5} />
      </div>
    </Wrap>
  )
}

export function FormSkeleton() {
  return (
    <Wrap className="max-w-4xl">
      <Panel className="h-14" />
      <Panel className="space-y-5 p-6">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </Panel>
    </Wrap>
  )
}

export function CalendarSkeleton() {
  return (
    <Wrap className="max-w-7xl">
      <Panel className="h-24" />
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Panel className="p-5">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }, (_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </Panel>
        <div className="space-y-4">
          <TextPanel lines={4} />
          <TextPanel lines={3} />
        </div>
      </div>
    </Wrap>
  )
}

export function AuditSkeleton() {
  return (
    <Wrap className="max-w-6xl">
      <Panel className="h-24" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Panel key={i} className="h-36" />
        ))}
      </div>
      <TextPanel lines={6} className="h-64" />
    </Wrap>
  )
}

export function ReportsSkeleton() {
  return (
    <Wrap className="max-w-5xl">
      <div className="flex gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-56" />
      </div>
      <Panel className="space-y-4 p-5">
        <Skeleton className="h-4 w-40" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
        <Skeleton className="h-10 w-40" />
      </Panel>
    </Wrap>
  )
}

export function SettingsSkeleton() {
  return (
    <Wrap className="max-w-6xl">
      <div className="flex gap-3 border-b border-border pb-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-28" />
        ))}
      </div>
      <TextPanel lines={4} className="max-w-xl" />
    </Wrap>
  )
}

export function HumanizerSkeleton() {
  return (
    <Wrap className="max-w-6xl">
      <div className="flex gap-3 border-b border-border pb-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Panel className="h-40" />
    </Wrap>
  )
}

export function KeywordsSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-[240px_1fr]">
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-6 w-32" />
        <TextPanel lines={5} />
      </div>
      <div className="space-y-5">
        <Panel className="h-20" />
        <div className="grid gap-4 md:grid-cols-2">
          <Panel className="h-40" />
          <Panel className="h-40" />
        </div>
        <Panel className="h-64" />
      </div>
    </div>
  )
}

export function ProposalsSkeleton() {
  return (
    <Wrap className="max-w-6xl">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-20" />
      </div>
      <Panel className="h-72" />
    </Wrap>
  )
}
