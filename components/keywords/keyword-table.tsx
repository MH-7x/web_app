"use client"

import { ArrowDown, ArrowUp, ArrowUpDown, Check, Plus, Search, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"

import { COMPETITION_STYLE, SummaryCards } from "@/components/keywords/summary-cards"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input, Select } from "@/components/ui/input"
import { COMPETITIONS, keyOf, normalizeChange, normalizeRow, type KeywordRow } from "@/lib/keywords-types"
import { cn } from "@/lib/utils"

type Field = keyof KeywordRow
type Sort = { key: Field; dir: "asc" | "desc" }

const COLUMNS: { key: Field; label: string; numeric?: boolean }[] = [
  { key: "keyword", label: "Keyword" },
  { key: "avgMonthlySearches", label: "Monthly Searches", numeric: true },
  { key: "threeMonthChange", label: "3-Month Change", numeric: true },
  { key: "competition", label: "Competition" },
  { key: "topOfPageBidLow", label: "Bid Low", numeric: true },
  { key: "topOfPageBidHigh", label: "Bid High", numeric: true },
]

const RANK = { "": 0, Low: 1, Medium: 2, High: 3 } as const
const changeValue = (r: KeywordRow) => Number.parseFloat(r.threeMonthChange) || 0
const PAGE = 100

function compare(a: KeywordRow, b: KeywordRow, key: Field) {
  if (key === "keyword") return a.keyword.localeCompare(b.keyword)
  if (key === "competition") return RANK[a.competition] - RANK[b.competition]
  if (key === "threeMonthChange") return changeValue(a) - changeValue(b)
  return (a[key] as number) - (b[key] as number)
}

function Change({ value }: { value: string }) {
  const n = Number.parseFloat(value) || 0
  return <span className={cn("tabular-nums", n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-destructive" : "text-muted-foreground")}>{n > 0 ? `+${value}` : value}</span>
}

function CompetitionBadge({ value }: { value: KeywordRow["competition"] }) {
  return value ? <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", COMPETITION_STYLE[value])}>{value}</span> : <span className="text-muted-foreground">–</span>
}

const money = (n: number) => n.toFixed(2)

/** Turn the text typed into a cell into the new value for that field, or an error message. */
function parseEdit(field: Field, text: string): { value: string | number } | { error: string } {
  const t = text.trim()
  if (field === "keyword") return t ? { value: t.replace(/\s+/g, " ") } : { error: "A keyword cannot be empty." }
  if (field === "threeMonthChange") return { value: normalizeChange(t) }
  const n = Number(t.replace(/,/g, ""))
  if (!t || !Number.isFinite(n) || n < 0) return { error: "Enter a number of 0 or more." }
  return { value: field === "avgMonthlySearches" ? Math.round(n) : Math.round(n * 100) / 100 }
}

export function KeywordTable({
  keywords,
  onChange,
  adding,
  onCloseAdd,
}: {
  keywords: KeywordRow[]
  onChange: (next: KeywordRow[]) => void
  adding: boolean
  onCloseAdd: () => void
}) {
  const [q, setQ] = useState("")
  // like Google Keyword Planner: competition matches any ticked level; the number filters are "at least" / "at most"
  const [levels, setLevels] = useState<Set<string>>(new Set())
  const [range, setRange] = useState({ searchesMin: "", searchesMax: "", bidMin: "", bidMax: "" })
  const [sort, setSort] = useState<Sort>({ key: "avgMonthlySearches", dir: "desc" })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [editing, setEditing] = useState<{ id: string; field: Field } | null>(null)
  const [draft, setDraft] = useState("")
  const [limit, setLimit] = useState(PAGE)

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    const bound = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v.replace(/,/g, ""))) ? null : Number(v.replace(/,/g, "")))
    const [sMin, sMax, bMin, bMax] = [range.searchesMin, range.searchesMax, range.bidMin, range.bidMax].map(bound)
    const list = keywords.filter(
      (r) =>
        (!term || r.keyword.toLowerCase().includes(term)) &&
        (levels.size === 0 || levels.has(r.competition)) &&
        (sMin === null || r.avgMonthlySearches >= sMin) &&
        (sMax === null || r.avgMonthlySearches <= sMax) &&
        (bMin === null || r.topOfPageBidLow >= bMin) &&
        (bMax === null || r.topOfPageBidLow <= bMax)
    )
    return list.sort((a, b) => (sort.dir === "asc" ? 1 : -1) * compare(a, b, sort.key))
  }, [keywords, q, levels, range, sort])

  const filtersOn = levels.size > 0 || Object.values(range).some((v) => v.trim() !== "")
  const setBound = (k: keyof typeof range, v: string) => {
    setRange((r) => ({ ...r, [k]: v }))
    setLimit(PAGE)
  }

  const shown = rows.slice(0, limit)
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(keyOf(r.keyword)))

  function startEdit(r: KeywordRow, field: Field) {
    setEditing({ id: keyOf(r.keyword), field })
    setDraft(field === "threeMonthChange" ? r.threeMonthChange : String(r[field] ?? ""))
  }

  function commit() {
    if (!editing) return
    const { id, field } = editing
    setEditing(null)
    const row = keywords.find((r) => keyOf(r.keyword) === id)
    if (!row) return
    const parsed = parseEdit(field, draft)
    if ("error" in parsed) return void toast.error(parsed.error)
    if (parsed.value === row[field]) return
    if (field === "keyword" && keyOf(String(parsed.value)) !== id && keywords.some((r) => keyOf(r.keyword) === keyOf(String(parsed.value)))) return void toast.error("That keyword is already in this group.")
    onChange(keywords.map((r) => (r === row ? { ...r, [field]: parsed.value } : r)))
    if (field === "keyword") setSelected((s) => new Set([...s].map((x) => (x === id ? keyOf(String(parsed.value)) : x))))
  }

  function setCompetitionOf(r: KeywordRow, value: string) {
    setEditing(null)
    onChange(keywords.map((x) => (x === r ? { ...x, competition: value as KeywordRow["competition"] } : x)))
  }

  function remove(ids: Set<string>) {
    onChange(keywords.filter((r) => !ids.has(keyOf(r.keyword))))
    setSelected(new Set())
    setConfirmBulk(false)
  }

  function toggleSort(key: Field) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "keyword" || key === "competition" ? "asc" : "desc" }))
  }

  /** A cell that turns into an input when clicked. */
  // a plain function, not a component: a component defined here would be recreated on every keystroke and drop the input focus
  function cell(r: KeywordRow, field: Field, children: React.ReactNode, numeric?: boolean) {
    const isEditing = editing?.id === keyOf(r.keyword) && editing.field === field
    if (isEditing && field === "competition") {
      return (
        <Select autoFocus aria-label="Competition" value={r.competition} onChange={(e) => setCompetitionOf(r, e.target.value)} onBlur={() => setEditing(null)} className="h-8 w-28">
          <option value="">–</option>
          {COMPETITIONS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      )
    }
    if (isEditing) {
      return (
        <Input
          autoFocus
          aria-label={COLUMNS.find((c) => c.key === field)?.label}
          value={draft}
          inputMode={numeric ? "decimal" : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") setEditing(null)
          }}
          className={cn("h-8", numeric && "w-28 text-right tabular-nums")}
        />
      )
    }
    return (
      <button type="button" onClick={() => startEdit(r, field)} title="Click to edit" className={cn("-mx-1.5 block w-full rounded px-1.5 py-1 hover:bg-muted", numeric ? "text-right" : "text-left")}>
        {children}
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <SummaryCards rows={rows} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64 max-w-full">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search keywords" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} placeholder="Search keywords…" className="pl-8" />
        </div>
        <span className="text-sm text-muted-foreground">
          {rows.length === keywords.length ? `${keywords.length.toLocaleString()} keywords` : `${rows.length.toLocaleString()} of ${keywords.length.toLocaleString()} keywords`}
        </span>
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            {confirmBulk ? (
              <>
                <span className="text-sm">Delete {selected.size} {selected.size === 1 ? "keyword" : "keywords"}?</span>
                <Button size="sm" variant="destructive" onClick={() => remove(selected)}>
                  <Trash2 /> Confirm
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmBulk(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmBulk(true)}>
                <Trash2 /> Delete {selected.size} selected
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-muted-foreground">Competition · matches any</legend>
          <div className="flex gap-1.5">
            {COMPETITIONS.map((c) => {
              const on = levels.has(c)
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setLevels((l) => { const n = new Set(l); if (n.has(c)) n.delete(c); else n.add(c); return n })
                    setLimit(PAGE)
                  }}
                  className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm ring-1 transition-colors", on ? "bg-primary text-primary-foreground ring-primary" : "bg-muted/60 ring-transparent hover:bg-muted")}
                >
                  {on && <Check className="size-3.5" />}
                  {c}
                </button>
              )
            })}
          </div>
        </fieldset>
        <RangeFilter label="Avg. monthly searches" min={range.searchesMin} max={range.searchesMax} onMin={(v) => setBound("searchesMin", v)} onMax={(v) => setBound("searchesMax", v)} />
        <RangeFilter label="Top of page bid (low range)" min={range.bidMin} max={range.bidMax} onMin={(v) => setBound("bidMin", v)} onMax={(v) => setBound("bidMax", v)} />
        {filtersOn && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLevels(new Set())
              setRange({ searchesMin: "", searchesMax: "", bidMin: "", bidMax: "" })
            }}
          >
            <X /> Clear filters
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/60 text-left text-[11px] tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="w-10 px-3 py-3">
                <input type="checkbox" aria-label="Select all keywords" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => keyOf(r.keyword))))} className="size-4 accent-primary" />
              </th>
              {COLUMNS.map((c) => {
                const active = sort.key === c.key
                const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown
                return (
                  <th key={c.key} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-3 font-medium", c.numeric && "text-right")}>
                    <button type="button" onClick={() => toggleSort(c.key)} className={cn("inline-flex items-center gap-1 uppercase hover:text-foreground", active && "text-foreground")}>
                      {c.label} <Icon className="size-3" />
                    </button>
                  </th>
                )
              })}
              <th className="px-3 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {adding && <AddRow keywords={keywords} onAdd={(row) => onChange([row, ...keywords])} onClose={onCloseAdd} />}
            {shown.map((r) => {
              const id = keyOf(r.keyword)
              return (
                <tr key={id} className={cn(selected.has(id) && "bg-primary/5")}>
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.keyword}`}
                      checked={selected.has(id)}
                      onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })}
                      className="size-4 accent-primary"
                    />
                  </td>
                  <td className="px-3 py-1.5 font-medium" dir="auto">
                    {cell(r, "keyword", r.keyword)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {cell(r, "avgMonthlySearches", r.avgMonthlySearches.toLocaleString(), true)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {cell(r, "threeMonthChange", <Change value={r.threeMonthChange} />, true)}
                  </td>
                  <td className="px-3 py-1.5">
                    {cell(r, "competition", <CompetitionBadge value={r.competition} />)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {cell(r, "topOfPageBidLow", money(r.topOfPageBidLow), true)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {cell(r, "topOfPageBidHigh", money(r.topOfPageBidHigh), true)}
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(r, "keyword")}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${r.keyword}`} onClick={() => remove(new Set([id]))} className="text-destructive hover:text-destructive">
                      Delete
                    </Button>
                  </td>
                </tr>
              )
            })}
            {shown.length === 0 && !adding && (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="px-4 py-12 text-center text-muted-foreground">
                  {keywords.length === 0 ? "No keywords yet. Upload a Keyword Planner export or add one." : "No keywords match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + 200)}>
            Show more ({(rows.length - shown.length).toLocaleString()} left)
          </Button>
        </div>
      )}
    </div>
  )
}

/** "At least" and "at most" boxes for one number column; either can be left empty. */
function RangeFilter({ label, min, max, onMin, onMax }: { label: string; min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground" aria-hidden>
          ≥
        </span>
        <Input aria-label={`${label}: at least`} inputMode="decimal" value={min} onChange={(e) => onMin(e.target.value)} placeholder="min" className="h-8 w-24 text-right" />
        <span className="text-sm text-muted-foreground" aria-hidden>
          ≤
        </span>
        <Input aria-label={`${label}: at most`} inputMode="decimal" value={max} onChange={(e) => onMax(e.target.value)} placeholder="max" className="h-8 w-24 text-right" />
      </div>
    </fieldset>
  )
}

/** The form row at the top of the table for adding one keyword by hand. */
function AddRow({ keywords, onAdd, onClose }: { keywords: KeywordRow[]; onAdd: (row: KeywordRow) => void; onClose: () => void }) {
  const [v, setV] = useState({ keyword: "", avgMonthlySearches: "", threeMonthChange: "", competition: "", topOfPageBidLow: "", topOfPageBidHigh: "" })
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }))

  function submit() {
    const row = normalizeRow({ ...v, avgMonthlySearches: v.avgMonthlySearches.replace(/,/g, "") })
    if (!row) return void toast.error("Type the keyword first.")
    if (keywords.some((r) => keyOf(r.keyword) === keyOf(row.keyword))) return void toast.error("That keyword is already in this group.")
    onAdd(row)
    setV({ keyword: "", avgMonthlySearches: "", threeMonthChange: "", competition: "", topOfPageBidLow: "", topOfPageBidHigh: "" })
  }

  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      submit()
    }
  }

  return (
    <tr className="bg-muted/40" onKeyDown={enter}>
      <td className="px-3 py-2">
        <Plus className="size-4 text-muted-foreground" />
      </td>
      <td className="px-3 py-2">
        <Input autoFocus aria-label="New keyword" value={v.keyword} onChange={(e) => set("keyword", e.target.value)} placeholder="movers in dubai" className="h-8" />
      </td>
      <td className="px-3 py-2">
        <Input aria-label="Monthly searches" inputMode="numeric" value={v.avgMonthlySearches} onChange={(e) => set("avgMonthlySearches", e.target.value)} placeholder="12100" className="h-8 text-right" />
      </td>
      <td className="px-3 py-2">
        <Input aria-label="3-month change" value={v.threeMonthChange} onChange={(e) => set("threeMonthChange", e.target.value)} placeholder="0%" className="h-8 text-right" />
      </td>
      <td className="px-3 py-2">
        <Select aria-label="Competition" value={v.competition} onChange={(e) => set("competition", e.target.value)} className="h-8">
          <option value="">–</option>
          {COMPETITIONS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </td>
      <td className="px-3 py-2">
        <Input aria-label="Bid low" inputMode="decimal" value={v.topOfPageBidLow} onChange={(e) => set("topOfPageBidLow", e.target.value)} placeholder="0.00" className="h-8 text-right" />
      </td>
      <td className="px-3 py-2">
        <Input aria-label="Bid high" inputMode="decimal" value={v.topOfPageBidHigh} onChange={(e) => set("topOfPageBidHigh", e.target.value)} placeholder="0.00" className="h-8 text-right" />
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <Button size="sm" onClick={submit}>
          <Check /> Add
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Close add form" onClick={onClose}>
          <X />
        </Button>
      </td>
    </tr>
  )
}
