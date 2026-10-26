"use client"

import { ChevronDown, ScrollText } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { CopyButton } from "@/components/copy-button"
import type { LogEntry, LogLevel } from "@/lib/audit/types"
import { cn } from "@/lib/utils"

const DOT: Record<LogLevel, string> = { info: "bg-blue-500", warn: "bg-yellow-500", error: "bg-red-500" }

const time = (ts: number) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(ts)

/** Collapsed to one line by default. Opened, it follows new lines as they arrive until the reader scrolls up. */
export function AuditLog({ entries, className }: { entries: LogEntry[]; className?: string }) {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  /** false once the reader scrolls away from the bottom; true again when they scroll back */
  const following = useRef(true)

  useEffect(() => {
    const el = panel.current
    if (open && el && following.current) el.scrollTop = el.scrollHeight
  }, [open, entries.length])

  if (!entries.length) return null

  return (
    <div className={cn("rounded-lg ring-1 ring-foreground/10", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm font-medium">
        <ScrollText className="size-4 text-muted-foreground" />
        <span className="flex-1">
          Audit log · {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="relative border-t border-border">
          <div className="absolute top-2 right-5 z-10">
            <CopyButton label="Copy Log" text={entries.map((e) => `${time(e.timestamp)} [${e.level}] ${e.message}`).join("\n")} />
          </div>
          <div
            ref={panel}
            onScroll={(e) => {
              const el = e.currentTarget
              following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
            }}
            role="log"
            className="max-h-[400px] overflow-y-auto bg-muted p-3 font-mono text-sm"
          >
            {entries.map((e, i) => (
              <div key={i} className="flex items-baseline gap-2 py-0.5">
                <span className="shrink-0 text-muted-foreground tabular-nums">{time(e.timestamp)}</span>
                <span aria-label={e.level} className={cn("size-2 shrink-0 translate-y-[-1px] rounded-full", DOT[e.level])} />
                <span dir="auto" className="min-w-0 break-words whitespace-pre-wrap">
                  {e.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
