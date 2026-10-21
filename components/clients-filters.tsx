"use client"

import { Download, MapPin, RotateCcw, Search } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { buttonVariants } from "@/components/ui/button"
import { Select } from "@/components/ui/input"
import { EMIRATES } from "@/lib/constants"
import { cn } from "@/lib/utils"

export function ClientsFilters({ emirateCounts }: { emirateCounts: Record<string, number> }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const urlQuery = params.get("q") ?? ""
  const emirate = params.get("emirate") ?? ""

  const [query, setQuery] = useState(urlQuery)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  function push(next: { q?: string; emirate?: string }) {
    const sp = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value) sp.set(key, value)
      else sp.delete(key)
    }
    sp.delete("page")
    const qs = sp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  const total = Object.values(emirateCounts).reduce((a, b) => a + b, 0)
  const exportQs = new URLSearchParams()
  if (urlQuery) exportQs.set("q", urlQuery)
  if (emirate) exportQs.set("emirate", emirate)

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            const value = e.target.value
            setQuery(value)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => push({ q: value.trim() }), 300)
          }}
          placeholder="Search moving companies, emirates, domain…"
          aria-label="Search clients"
          className="h-9 w-full rounded-lg bg-muted pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="relative w-52">
        <MapPin className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Select
          value={emirate}
          onChange={(e) => push({ emirate: e.target.value })}
          aria-label="Filter by emirate"
          className="bg-muted pl-8"
        >
          <option value="">All Emirates ({total})</option>
          {EMIRATES.map((e) => (
            <option key={e} value={e}>
              {e} ({emirateCounts[e] ?? 0})
            </option>
          ))}
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <span className="px-2 text-xs text-muted-foreground max-md:hidden">Sorted by recent</span>
        <button
          type="button"
          onClick={() => {
            clearTimeout(timer.current)
            setQuery("")
            router.replace(pathname)
          }}
          disabled={!urlQuery && !emirate && !query}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <RotateCcw /> Reset
        </button>
        <a href={`/clients/export${exportQs.size ? `?${exportQs}` : ""}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Download /> Export
        </a>
      </div>
    </div>
  )
}
