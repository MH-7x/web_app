"use client"

import { Gauge, Loader2, Play, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { SpeedCandidate, SpeedDevice, SpeedSelection } from "@/lib/audit/types"
import { cn } from "@/lib/utils"

const MAX_TESTS = 20
const DEVICES: SpeedDevice[] = ["mobile", "desktop"]
const keyOf = (url: string, device: SpeedDevice) => `${device}|${url}`

function decodeSafe(s: string) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Shown when the crawl has finished: pick the pages (and devices) the speed tests should run on. */
export function SpeedPicker({ candidates, busy, onRun }: { candidates: SpeedCandidate[]; busy: boolean; onRun: (selection: SpeedSelection[]) => void }) {
  const suggested = useMemo(() => new Set(candidates.flatMap((c) => c.suggested.map((d) => keyOf(c.url, d)))), [candidates])
  const [q, setQ] = useState("")
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(suggested))

  // suggested pages first, then the most linked-to
  const sorted = useMemo(() => [...candidates].sort((a, b) => b.suggested.length - a.suggested.length || b.inlinks - a.inlinks || a.path.localeCompare(b.path)), [candidates])
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return term ? sorted.filter((c) => decodeSafe(c.path).toLowerCase().includes(term) || c.title.toLowerCase().includes(term)) : sorted
  }, [sorted, q])

  const toggle = (k: string) =>
    setChosen((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const setMany = (device: SpeedDevice | null, on: boolean) =>
    setChosen((s) => {
      const n = new Set(s)
      for (const c of shown) {
        for (const d of device ? [device] : DEVICES) {
          if (on) n.add(keyOf(c.url, d))
          else n.delete(keyOf(c.url, d))
        }
      }
      return n
    })

  const selection = candidates.flatMap((c) => DEVICES.filter((d) => chosen.has(keyOf(c.url, d))).map((device) => ({ url: c.url, device })))
  const tooMany = selection.length > MAX_TESTS
  // the homepage is the one suggested on both devices
  const homeMobile = candidates.some((c) => c.suggested.length === 2 && chosen.has(keyOf(c.url, "mobile")))

  return (
    <Card className="space-y-4 p-5" aria-live="polite">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 font-semibold">
          <Gauge className="size-4 text-primary" /> Choose the pages to speed test
        </h3>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The crawl found <strong>{candidates.length}</strong> {candidates.length === 1 ? "page" : "pages"}. Tick the pages and devices to test. Each test takes about a minute, so pick the pages that matter most. The audit is paused until you choose.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64 max-w-full">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search pages" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages…" className="pl-8" />
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setMany("mobile", true)}>
          All mobile
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setMany("desktop", true)}>
          All desktop
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setMany(null, false)}>
          Clear
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setChosen(new Set(suggested))}>
          Suggested
        </Button>
        {q && <span className="text-xs text-muted-foreground">Buttons apply to the {shown.length} matching pages</span>}
      </div>

      <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg ring-1 ring-foreground/10">
        {shown.map((c) => (
          <li key={c.url} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm" dir="auto" title={c.url}>
                {c.path === "/" ? "/ (homepage)" : decodeSafe(c.path)}
              </p>
              {c.title && (
                <p className="truncate text-xs text-muted-foreground" dir="auto">
                  {c.title}
                </p>
              )}
            </div>
            {DEVICES.map((d) => (
              <label key={d} className={cn("flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs", chosen.has(keyOf(c.url, d)) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
                <input type="checkbox" checked={chosen.has(keyOf(c.url, d))} onChange={() => toggle(keyOf(c.url, d))} aria-label={`${d} speed test for ${c.path}`} className="size-3.5 accent-primary" />
                {d === "mobile" ? "Mobile" : "Desktop"}
              </label>
            ))}
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">No pages match.</li>}
      </ul>

      {!homeMobile && selection.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">The homepage on mobile is what the main speed grade is based on. Without it, the speed figures are estimated.</p>}
      {tooMany && (
        <p role="alert" className="text-xs text-destructive">
          Choose at most {MAX_TESTS} speed tests.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground tabular-nums">
          {selection.length} {selection.length === 1 ? "test" : "tests"} selected{selection.length > 0 && ` · about ${selection.length} ${selection.length === 1 ? "minute" : "minutes"}`}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onRun([])}>
            Skip speed tests
          </Button>
          <Button type="button" disabled={busy || tooMany || selection.length === 0} onClick={() => onRun(selection)}>
            {busy ? <Loader2 className="animate-spin" /> : <Play />} Run {selection.length || ""} speed {selection.length === 1 ? "test" : "tests"}
          </Button>
        </div>
      </div>
    </Card>
  )
}
