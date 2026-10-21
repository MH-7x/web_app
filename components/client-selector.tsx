"use client"

import { Check, ChevronDown, Plus, Search, X } from "lucide-react"
import Link from "next/link"
import { useOptimistic, useState, useTransition } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { setActiveClientAction } from "@/lib/actions"
import { cn } from "@/lib/utils"

type Option = { id: string; name: string; nameAr: string; emirate: string }

export function ClientSelector({ clients, activeId }: { clients: Option[]; activeId: string | null }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [optimisticId, setOptimisticId] = useOptimistic(activeId)
  const [, startTransition] = useTransition()

  const active = clients.find((c) => c.id === optimisticId)
  const term = query.trim().toLowerCase()
  const filtered = term
    ? clients.filter((c) => [c.name, c.nameAr, c.emirate].some((v) => v.toLowerCase().includes(term)))
    : clients

  function select(id: string | null) {
    setOpen(false)
    startTransition(async () => {
      setOptimisticId(id)
      await setActiveClientAction(id)
    })
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <PopoverTrigger
        aria-label="Select active client"
        className="flex h-8 w-64 max-w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        <span className={cn("size-1.5 shrink-0 rounded-full", active ? "bg-chart-3" : "bg-muted-foreground/40")} />
        <span className={cn("flex-1 truncate text-left", !active && "text-muted-foreground")}>
          {active ? active.name : "Select a client"}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent className="w-72 p-1.5">
        <div className="relative mb-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients…"
            aria-label="Search clients"
            className="h-8 w-full rounded-md bg-muted pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <ul role="listbox" aria-label="Clients" className="max-h-64 overflow-y-auto">
          {filtered.map((c) => (
            <li key={c.id} role="option" aria-selected={c.id === optimisticId}>
              <button
                type="button"
                onClick={() => select(c.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">{c.emirate}</span>
                </span>
                {c.id === optimisticId && <Check className="size-4 text-primary" />}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-2 py-3 text-center text-sm text-muted-foreground">
              {clients.length === 0 ? "No clients yet." : "No clients match your search."}
            </li>
          )}
        </ul>

        <div className="mt-1 flex items-center justify-between border-t border-border pt-1">
          <Link
            href="/clients/new"
            onClick={() => setOpen(false)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-primary hover:bg-muted"
          >
            <Plus className="size-3.5" /> Add client
          </Link>
          {active && (
            <button
              type="button"
              onClick={() => select(null)}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              <X className="size-3.5" /> Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
