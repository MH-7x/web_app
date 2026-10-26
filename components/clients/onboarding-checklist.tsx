"use client"

import { Check, Plus, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  CHECKLIST_SECTIONS,
  MAX_ITEM_LABEL,
  checklistProgress,
  type ChecklistItem,
  type ChecklistSection,
} from "@/lib/onboarding-checklist-types"
import { cn } from "@/lib/utils"

type ChecklistRequest =
  | { method: "PUT"; body: { id: string; checked: boolean } }
  | { method: "POST"; body: { label: string; section: ChecklistSection } }
  | { method: "DELETE"; body: { id: string } }

/** Dates are shown in Dubai time so the server render and the browser agree. */
const doneOn = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Dubai" })

export function OnboardingChecklist({ clientId, initialItems }: { clientId: string; initialItems: ChecklistItem[] }) {
  const [items, setItems] = useState(initialItems)
  const [adding, setAdding] = useState<ChecklistSection | null>(null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  const { done, total, percent } = checklistProgress(items)

  /** Returns the server's list, or null after showing why it failed. */
  async function send({ method, body }: ChecklistRequest) {
    try {
      const res = await fetch(`/api/clients/${clientId}/checklist`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { items?: ChecklistItem[]; error?: string }
      if (!res.ok || !data.items) {
        toast.error(data.error ?? "Couldn't update the checklist. Please try again.")
        return null
      }
      router.refresh() // the tab badge and the clients list read the same progress
      return data.items
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.")
      return null
    }
  }

  async function toggle(item: ChecklistItem) {
    const checked = !item.checked
    const before = items
    // tick it straight away; the server's list replaces this one, or the old list comes back on failure
    setItems(items.map((i) => (i.id === item.id ? { ...i, checked, checkedAt: checked ? new Date().toISOString() : null } : i)))
    setItems((await send({ method: "PUT", body: { id: item.id, checked } })) ?? before)
  }

  async function remove(item: ChecklistItem) {
    setBusy(true)
    const next = await send({ method: "DELETE", body: { id: item.id } })
    if (next) setItems(next)
    setBusy(false)
  }

  async function add(section: ChecklistSection) {
    const label = draft.trim()
    if (!label || busy) return
    setBusy(true)
    const next = await send({ method: "POST", body: { label, section } })
    if (next) {
      setItems(next)
      setDraft("")
      setAdding(null)
    }
    setBusy(false)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-lg font-semibold tracking-tight">
            {done}/{total} completed <span className="text-muted-foreground">({percent}%)</span>
          </p>
          {total > 0 && done === total && <span className="text-sm font-medium text-primary">All set up</span>}
        </div>
        <div role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {CHECKLIST_SECTIONS.map((section) => {
        const rows = items.filter((i) => i.section === section)
        const sectionDone = rows.filter((i) => i.checked).length
        return (
          <section key={section} aria-label={section} className="rounded-xl bg-card ring-1 ring-foreground/10">
            <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">{section}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {sectionDone}/{rows.length}
              </span>
            </header>

            {rows.length > 0 && (
              <ul className="divide-y divide-border">
                {rows.map((item) => (
                  <li key={item.id} className="group flex items-center gap-3 px-5 py-2.5">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={item.checked} onChange={() => void toggle(item)} className="peer sr-only" />
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-md ring-1 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                          item.checked ? "bg-primary text-primary-foreground ring-primary" : "bg-background ring-foreground/25 hover:ring-foreground/50"
                        )}
                      >
                        {item.checked && <Check className="size-3.5" />}
                      </span>
                      <span className={cn("min-w-0 text-sm", item.checked && "text-muted-foreground line-through")}>
                        {item.label}
                        {item.isCustom && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground no-underline">Custom</span>}
                      </span>
                    </label>
                    {item.checked && item.checkedAt && <time dateTime={item.checkedAt} className="shrink-0 text-xs text-muted-foreground">{doneOn(item.checkedAt)}</time>}
                    {item.isCustom && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={busy}
                        aria-label={`Remove ${item.label}`}
                        onClick={() => void remove(item)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className={cn("px-5 py-3", rows.length > 0 && "border-t border-border")}>
              {adding === section ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void add(section)
                  }}
                >
                  <Input
                    autoFocus
                    aria-label={`New task in ${section}`}
                    value={draft}
                    maxLength={MAX_ITEM_LABEL}
                    placeholder="e.g. Get Arabic logo version"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setAdding(null)
                        setDraft("")
                      }
                    }}
                  />
                  <Button type="submit" size="lg" disabled={busy || !draft.trim()}>
                    Add
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setAdding(null)
                      setDraft("")
                    }}
                  >
                    Cancel
                  </Button>
                </form>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAdding(section)
                    setDraft("")
                  }}
                >
                  <Plus /> Add Item
                </Button>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
