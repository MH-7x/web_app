"use client"

import { Download, KeyRound, Loader2, Plus, Trash2, Upload } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { ImportDialog } from "@/components/keywords/import-dialog"
import { KeywordTable } from "@/components/keywords/keyword-table"
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Input, Label, Select } from "@/components/ui/input"
import { downloadFile } from "@/lib/download"
import type { KeywordGroupData, KeywordGroupSummary, KeywordRow } from "@/lib/keywords-types"
import { cn } from "@/lib/utils"

type ClientOption = { id: string; name: string }

const SHARED = "shared"

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined })
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !body) throw new Error(body?.error ?? `Request failed (${res.status}).`)
  return body
}

export function KeywordsWorkspace({ initialGroups, clients, activeClientId }: { initialGroups: KeywordGroupSummary[]; clients: ClientOption[]; activeClientId: string | null }) {
  const [groups, setGroups] = useState(initialGroups)
  const [selectedId, setSelectedId] = useState<string | null>(initialGroups[0]?.id ?? null)
  /** the last group fetched (or the error that fetch hit); it only counts while it matches selectedId */
  const [loaded, setLoaded] = useState<{ id: string; group: KeywordGroupData | null; error?: string } | null>(null)
  const current = loaded && loaded.id === selectedId ? loaded : null
  const group = current?.group ?? null
  const loadError = current?.error ?? null
  const loading = selectedId !== null && current === null
  const setGroup = (next: KeywordGroupData | null | ((g: KeywordGroupData | null) => KeywordGroupData | null)) =>
    setLoaded((l) => {
      const value = typeof next === "function" ? next(l?.group ?? null) : next
      return value ? { id: value.id, group: value } : null
    })
  const [filter, setFilter] = useState<string>("all") // "all", "shared", or a client id
  const [adding, setAdding] = useState(false)
  const [creating, setCreating] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients])

  /* ---- load the selected group ---- */
  useEffect(() => {
    if (!selectedId) return
    let stale = false
    api<{ group: KeywordGroupData }>(`/api/keywords/${selectedId}`)
      .then((b) => !stale && setLoaded({ id: selectedId, group: b.group }))
      .catch((e) => !stale && setLoaded({ id: selectedId, group: null, error: e instanceof Error ? e.message : "Could not load this group." }))
    return () => {
      stale = true
    }
  }, [selectedId])

  function selectGroup(id: string | null) {
    setSelectedId(id)
    setAdding(false)
  }

  const patchSummary = useCallback((id: string, patch: Partial<KeywordGroupSummary>) => setGroups((all) => all.map((g) => (g.id === id ? { ...g, ...patch } : g))), [])

  /* ---- saving keyword edits: always send the newest list, one request at a time ---- */
  const pending = useRef<{ id: string; keywords: KeywordRow[] } | null>(null)
  const flushing = useRef(false)

  async function flush() {
    if (flushing.current) return
    flushing.current = true
    setSaving(true)
    try {
      while (pending.current) {
        const job = pending.current
        pending.current = null
        await api(`/api/keywords/${job.id}`, { method: "PUT", body: JSON.stringify({ keywords: job.keywords }) })
      }
    } catch (e) {
      toast.error("Couldn't save your changes", { description: e instanceof Error ? e.message : undefined })
    } finally {
      flushing.current = false
      setSaving(false)
    }
  }

  function changeKeywords(next: KeywordRow[]) {
    if (!group) return
    setGroup({ ...group, keywords: next })
    patchSummary(group.id, { count: next.length })
    pending.current = { id: group.id, keywords: next }
    void flush()
  }

  async function updateGroup(patch: { name?: string; clientId?: string | null }) {
    if (!group) return
    try {
      const b = await api<{ group: KeywordGroupData; summary: KeywordGroupSummary }>(`/api/keywords/${group.id}`, { method: "PUT", body: JSON.stringify(patch) })
      setGroup((g) => (g && g.id === b.group.id ? { ...g, name: b.group.name, clientId: b.group.clientId } : g))
      patchSummary(group.id, { name: b.summary.name, clientId: b.summary.clientId })
    } catch (e) {
      toast.error("Couldn't update the group", { description: e instanceof Error ? e.message : undefined })
    }
  }

  async function deleteGroup() {
    if (!group) return
    try {
      await api(`/api/keywords/${group.id}`, { method: "DELETE" })
      const rest = groups.filter((g) => g.id !== group.id)
      setGroups(rest)
      setGroup(null)
      selectGroup(rest[0]?.id ?? null)
      toast.success("Group deleted", { description: group.name })
    } catch (e) {
      toast.error("Couldn't delete the group", { description: e instanceof Error ? e.message : undefined })
    }
  }

  async function exportCsv() {
    if (!group) return
    const { default: Papa } = await import("papaparse")
    const csv = Papa.unparse({
      fields: ["Keyword", "Avg. monthly searches", "Three month change", "Competition", "Top of page bid (low range)", "Top of page bid (high range)"],
      data: group.keywords.map((k) => [k.keyword, k.avgMonthlySearches, k.threeMonthChange, k.competition, k.topOfPageBidLow, k.topOfPageBidHigh]),
    })
    // the byte-order mark makes Excel read Arabic keywords correctly
    downloadFile(`${group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "keywords"}.csv`, `﻿${csv}`, "text/csv")
  }

  /* ---- left panel ---- */
  const sections = useMemo(() => {
    const visible = groups.filter((g) => filter === "all" || (filter === SHARED ? g.clientId === null : g.clientId === filter))
    const known = new Set(clients.map((c) => c.id))
    const out: { id: string; title: string; groups: KeywordGroupSummary[] }[] = [{ id: SHARED, title: "Shared (all clients)", groups: visible.filter((g) => g.clientId === null || !known.has(g.clientId)) }]
    for (const c of clients) out.push({ id: c.id, title: c.name, groups: visible.filter((g) => g.clientId === c.id) })
    return out.filter((s) => s.groups.length > 0)
  }, [groups, clients, filter])

  const headings = useMemo(() => {
    const used = new Set(groups.map((g) => g.clientId))
    return [{ id: SHARED, title: "Shared" }, ...clients.filter((c) => used.has(c.id)).map((c) => ({ id: c.id, title: c.name }))].filter((h) => h.id !== SHARED || groups.some((g) => g.clientId === null))
  }, [groups, clients])

  return (
    <div className="grid gap-5 md:grid-cols-[240px_1fr]">
      <aside aria-label="Keyword groups" className="space-y-3">
        <Button className="w-full" onClick={() => setCreating(true)}>
          <Plus /> New Group
        </Button>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All Groups
          </FilterChip>
          {headings.map((h) => (
            <FilterChip key={h.id} active={filter === h.id} onClick={() => setFilter(filter === h.id ? "all" : h.id)}>
              {h.title}
            </FilterChip>
          ))}
        </div>
        {groups.length === 0 && <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">Create your first keyword group, then upload a Keyword Planner export.</p>}
        <nav className="space-y-4">
          {sections.map((s) => (
            <div key={s.id} className="space-y-1">
              <h2 className="truncate px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{s.title}</h2>
              <ul className="space-y-0.5">
                {s.groups.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      aria-current={g.id === selectedId ? "true" : undefined}
                      onClick={() => selectGroup(g.id)}
                      className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-start text-sm transition-colors", g.id === selectedId ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                    >
                      <span className="truncate">{g.name}</span>
                      <span className={cn("text-xs tabular-nums", g.id === selectedId ? "text-primary-foreground/80" : "text-muted-foreground")}>{g.count.toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <section className="min-w-0 space-y-5">
        {!selectedId ? (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-20 text-center ring-1 ring-foreground/10">
            <KeyRound className="size-8 text-muted-foreground/60" />
            <p className="font-medium">Create your first keyword group</p>
            <p className="max-w-md text-sm text-muted-foreground">Create a group, such as &quot;Dubai Location Keywords&quot;, then upload the CSV you exported from Google Keyword Planner.</p>
            <Button onClick={() => setCreating(true)}>
              <Plus /> New Group
            </Button>
          </div>
        ) : loadError ? (
          <ErrorNote message={loadError} />
        ) : !group || loading ? (
          <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading keywords…
          </p>
        ) : (
          <>
            <GroupHeader
              key={group.id}
              group={group}
              clients={clients}
              saving={saving}
              onRename={(name) => updateGroup({ name })}
              onClient={(clientId) => updateGroup({ clientId })}
              onUpload={() => fileInput.current?.click()}
              onAdd={() => setAdding(true)}
              onExport={exportCsv}
              onDelete={deleteGroup}
              clientName={group.clientId ? (clientName.get(group.clientId) ?? "Unknown client") : "Shared"}
            />
            <KeywordTable keywords={group.keywords} onChange={changeKeywords} adding={adding} onCloseAdd={() => setAdding(false)} />
          </>
        )}
      </section>

      <input
        ref={fileInput}
        type="file"
        accept=".csv,.xlsx"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          setImportFile(e.target.files?.[0] ?? null)
          e.target.value = "" // so choosing the same file again still fires
        }}
      />
      {group && <ImportDialog groupId={group.id} file={importFile} onClose={() => setImportFile(null)} onImported={(keywords) => { setGroup((g) => (g ? { ...g, keywords } : g)); patchSummary(group.id, { count: keywords.length }) }} />}

      <NewGroupDialog
        open={creating}
        clients={clients}
        defaultClientId={activeClientId}
        onClose={() => setCreating(false)}
        onCreated={(g) => {
          setGroups((all) => [...all, g].sort((a, b) => a.name.localeCompare(b.name)))
          selectGroup(g.id)
          setFilter("all")
          setCreating(false)
        }}
      />
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("max-w-full truncate rounded-lg px-2.5 py-1 text-xs font-medium transition-colors", active ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground hover:bg-muted")}>
      {children}
    </button>
  )
}

function GroupHeader({
  group,
  clients,
  saving,
  clientName,
  onRename,
  onClient,
  onUpload,
  onAdd,
  onExport,
  onDelete,
}: {
  group: KeywordGroupData
  clients: ClientOption[]
  saving: boolean
  clientName: string
  onRename: (name: string) => void
  onClient: (clientId: string | null) => void
  onUpload: () => void
  onAdd: () => void
  onExport: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(group.name)

  function commitName() {
    const next = name.trim()
    if (!next) return setName(group.name)
    if (next !== group.name) onRename(next)
  }

  return (
    <header className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="min-w-56 flex-1 space-y-1">
        <Input
          aria-label="Group name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") {
              setName(group.name)
              e.currentTarget.blur()
            }
          }}
          className="h-9 border-transparent bg-transparent px-1 text-lg font-semibold tracking-tight hover:border-input dark:bg-transparent"
        />
        <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          {group.keywords.length.toLocaleString()} {group.keywords.length === 1 ? "keyword" : "keywords"}
          {saving && (
            <span className="flex items-center gap-1 text-xs">
              <Loader2 className="size-3 animate-spin" /> Saving
            </span>
          )}
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="group-client" className="text-xs font-normal text-muted-foreground">
          Client
        </Label>
        <Select id="group-client" value={group.clientId ?? ""} onChange={(e) => onClient(e.target.value || null)} className="w-48" title={clientName}>
          <option value="">Shared (all clients)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onUpload}>
          <Upload /> Upload CSV
        </Button>
        <Button variant="outline" onClick={onAdd}>
          <Plus /> Add Keyword
        </Button>
        <Button variant="outline" onClick={onExport} disabled={group.keywords.length === 0}>
          <Download /> Export
        </Button>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            <Trash2 /> Delete Group
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Delete {group.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the group and its {group.keywords.length.toLocaleString()} {group.keywords.length === 1 ? "keyword" : "keywords"}. This cannot be undone.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
              <AlertDialogClose render={<Button variant="destructive" onClick={onDelete} />}>
                <Trash2 /> Delete group
              </AlertDialogClose>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  )
}

function NewGroupDialog({ open, clients, defaultClientId, onClose, onCreated }: { open: boolean; clients: ClientOption[]; defaultClientId: string | null; onClose: () => void; onCreated: (g: KeywordGroupSummary) => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <NewGroupForm clients={clients} defaultClientId={defaultClientId} onClose={onClose} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  )
}

/** Mounted fresh each time the dialog opens, so it always starts blank. */
function NewGroupForm({ clients, defaultClientId, onClose, onCreated }: { clients: ClientOption[]; defaultClientId: string | null; onClose: () => void; onCreated: (g: KeywordGroupSummary) => void }) {
  const [name, setName] = useState("")
  const [clientId, setClientId] = useState(defaultClientId ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const b = await api<{ group: KeywordGroupSummary }>("/api/keywords", { method: "POST", body: JSON.stringify({ name, clientId: clientId || null }) })
      onCreated(b.group)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={create}>
      <DialogTitle>New keyword group</DialogTitle>
      <DialogDescription>Name it after the topic, such as &quot;Dubai Location Keywords&quot; or &quot;Arabic Keywords&quot;.</DialogDescription>
      <div className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-group-name">Name</Label>
          <Input id="new-group-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Sharjah Services" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-group-client">Client</Label>
          <Select id="new-group-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Shared (all clients)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        {error && <ErrorNote message={error} />}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />} Create group
        </Button>
      </DialogFooter>
    </form>
  )
}
