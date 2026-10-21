"use client"

import { Braces, Check, Loader2, RotateCcw, Zap } from "lucide-react"
import { useMemo, useRef, useState } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { CopyButton } from "@/components/copy-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/input"
import type { TemplateRecord } from "@/lib/prompts/store"
import { examplesProblem, templateProblems } from "@/lib/prompts/templates"
import { cn } from "@/lib/utils"

const pretty = (v: unknown) => JSON.stringify(v ?? [], null, 2)

export function PromptsTab({ initial }: { initial: TemplateRecord[] }) {
  const [records, setRecords] = useState(initial)
  const [selected, setSelected] = useState(initial[0].name)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const record = records.find((r) => r.name === selected)!

  function choose(name: string) {
    if (name === selected) return
    if (dirty && !window.confirm("You have unsaved changes to this prompt. Discard them?")) return
    setDirty(false)
    setNotice(null)
    setSelected(name as typeof selected)
  }

  function updated(next: TemplateRecord, message: string) {
    setRecords((all) => all.map((r) => (r.name === next.name ? next : r)))
    setNotice(message)
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Prompt templates" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {records.map((r) => (
          <button
            key={r.name}
            type="button"
            aria-current={r.name === selected}
            onClick={() => choose(r.name)}
            className={cn(
              "flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
              r.name === selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {r.label}
            {r.edited && <span title="Edited from the default" className={cn("size-1.5 shrink-0 rounded-full", r.name === selected ? "bg-primary-foreground" : "bg-primary")} />}
          </button>
        ))}
      </nav>

      <Editor key={`${record.name}-${record.version}`} record={record} notice={notice} onDirty={setDirty} onSaved={updated} />
    </div>
  )
}

type Test = { state: "idle" } | { state: "running" } | { state: "done"; output: string } | { state: "error"; message: string }

function Editor({ record, notice, onDirty, onSaved }: { record: TemplateRecord; notice: string | null; onDirty: (d: boolean) => void; onSaved: (r: TemplateRecord, message: string) => void }) {
  const [prompt, setPrompt] = useState(record.systemPrompt)
  const [examples, setExamples] = useState(pretty(record.examples))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [test, setTest] = useState<Test>({ state: "idle" })
  const area = useRef<HTMLTextAreaElement>(null)

  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(examples) as unknown }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Invalid JSON" }
    }
  }, [examples])
  const examplesError = !parsed.ok ? `Not valid JSON: ${parsed.error}` : examplesProblem(parsed.value)
  const promptProblems = useMemo(() => templateProblems(prompt, record), [prompt, record])

  const changed = prompt.trim() !== record.systemPrompt.trim() || (parsed.ok && JSON.stringify(parsed.value) !== JSON.stringify(record.examples ?? []))
  const valid = !examplesError && promptProblems.length === 0

  const touch = (nextChanged: boolean) => onDirty(nextChanged)

  function insert(name: string) {
    const el = area.current
    const text = `{{${name}}}`
    if (!el) return setPrompt((p) => p + text)
    const { selectionStart: a, selectionEnd: b } = el
    const next = prompt.slice(0, a) + text + prompt.slice(b)
    setPrompt(next)
    touch(true)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(a + text.length, a + text.length)
    })
  }

  async function save() {
    if (!parsed.ok) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/settings/prompts/${record.name}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemPrompt: prompt, examples: parsed.value }) })
      const body = (await res.json().catch(() => null)) as { template?: TemplateRecord; error?: string } | null
      if (!res.ok || !body?.template) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      onDirty(false)
      onSaved(body.template, "Saved. The next generation uses this prompt.")
      toast.success("Prompt saved", { description: "The next generation uses it." })
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setError(message)
      toast.error("Couldn't save the prompt", { description: message })
      setSaving(false)
    }
  }

  async function reset() {
    if (!window.confirm(`Reset "${record.label}" to the built-in default? Your edits to this prompt will be lost.`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/settings/prompts/${record.name}/reset`, { method: "POST" })
      const body = (await res.json().catch(() => null)) as { template?: TemplateRecord; error?: string } | null
      if (!res.ok || !body?.template) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      onDirty(false)
      onSaved(body.template, "Reset to the default prompt.")
      toast.success("Prompt reset to default")
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setError(message)
      toast.error("Couldn't reset the prompt", { description: message })
      setSaving(false)
    }
  }

  async function runTest() {
    if (!parsed.ok) return
    setTest({ state: "running" })
    try {
      const res = await fetch(`/api/settings/prompts/${record.name}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemPrompt: prompt, examples: parsed.value }) })
      const body = (await res.json().catch(() => null)) as { output?: string; error?: string } | null
      if (!res.ok || typeof body?.output !== "string") throw new Error(body?.error ?? `Request failed (${res.status}).`)
      setTest({ state: "done", output: body.output })
      toast.success("Sample generated")
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setTest({ state: "error", message })
      toast.error("The test failed", { description: message })
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <Card className="space-y-5 p-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{record.label}: System Prompt</h2>
            {record.edited ? <Badge>Edited</Badge> : <Badge variant="muted">Default</Badge>}
            <span className="text-xs text-muted-foreground">v{record.version}</span>
          </div>
          <p className="text-sm text-muted-foreground">{record.description} Saved changes apply to the next generation.</p>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Variables (click to insert)</p>
          <div className="flex flex-wrap gap-1.5">
            {record.variables.map((v) => (
              <button key={v.name} type="button" onClick={() => insert(v.name)} title={v.description} className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground">
                {`{{${v.name}}}`}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Wrap text in <code className="font-mono">{"{{#name}} … {{/name}}"}</code> to include it only when that variable has a value.
          </p>
        </div>

        <div className="space-y-1.5">
          <Textarea
            ref={area}
            aria-label={`${record.label} system prompt`}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value)
              touch(true)
            }}
            spellCheck={false}
            rows={18}
            className="min-h-80 resize-y bg-muted/40 py-3 font-mono text-[13px] leading-relaxed"
          />
          {promptProblems.map((p) => (
            <p key={p} role="alert" className="text-sm text-destructive">
              {p}
            </p>
          ))}
        </div>

        <div className="space-y-1.5 border-t border-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold">Few-Shot Examples</h3>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs", examplesError ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>{examplesError ? "Needs fixing" : "Valid JSON"}</span>
              <Button type="button" variant="outline" size="sm" disabled={!parsed.ok} onClick={() => parsed.ok && setExamples(pretty(parsed.value))}>
                <Braces /> Format
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            An array of strings, or <code className="font-mono">{`{"en": ["…"], "ar": ["…"]}`}</code> for per-language examples. They appear where the prompt has <code className="font-mono">{"{{examples}}"}</code>.
          </p>
          <Textarea
            aria-label={`${record.label} few-shot examples (JSON)`}
            aria-invalid={Boolean(examplesError)}
            value={examples}
            onChange={(e) => {
              setExamples(e.target.value)
              touch(true)
            }}
            spellCheck={false}
            rows={10}
            className="min-h-40 resize-y bg-muted/40 py-3 font-mono text-[13px] leading-relaxed"
          />
          {examplesError && (
            <p role="alert" className="text-sm text-destructive">
              {examplesError}
            </p>
          )}
        </div>

        {error && <ErrorNote message={error} />}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={saving || !changed || !valid} size="lg" className="h-9 px-4">
            {saving ? <Loader2 className="animate-spin" /> : <Check />} Save
          </Button>
          <Button variant="outline" size="lg" onClick={reset} disabled={saving || (!record.edited && !changed)} className="h-9 px-4">
            <RotateCcw /> Reset to Default
          </Button>
          <Button variant="outline" size="lg" onClick={runTest} disabled={saving || !valid || test.state === "running"} className="h-9 px-4">
            {test.state === "running" ? <Loader2 className="animate-spin" /> : <Zap />} Test with Sample Client
          </Button>
          {notice && !changed && <span role="status" className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</span>}
          {changed && !saving && <span className="text-xs text-muted-foreground">Unsaved changes. The test uses what is in the editor.</span>}
        </div>
      </Card>

      {test.state !== "idle" && (
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">Sample output</h3>
            {test.state === "done" && <CopyButton text={test.output} />}
          </div>
          {test.state === "running" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" /> Running the real generator for a sample client (Al Noor Movers, Sharjah). This can take up to a minute.
            </p>
          )}
          {test.state === "error" && <ErrorNote message={test.message} onRetry={runTest} />}
          {test.state === "done" && (
            <pre dir="auto" className="max-h-[32rem] overflow-auto rounded-lg bg-muted/40 p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">
              {test.output || "The generator returned nothing."}
            </pre>
          )}
          <p className="text-xs text-muted-foreground">The sample client is made up and nothing is saved.</p>
        </Card>
      )}
    </div>
  )
}
