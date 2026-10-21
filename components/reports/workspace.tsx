"use client"

import { ArrowDown, ArrowUp, Download, Loader2, RefreshCw, Zap } from "lucide-react"
import { useState } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { CopyButton } from "@/components/copy-button"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label } from "@/components/ui/input"
import {
  METRIC_FIELDS,
  buildStats,
  parseMonth,
  renderReportMarkdown,
  type Metrics,
  type MetricInput,
  type Month,
  type Report,
  type Stat,
} from "@/lib/reports-types"
import { cn } from "@/lib/utils"

type Result = { month: Month; clientName: string; report: Report; stats: Stat[] }

const SAMPLE_NOTE = "Leave a box empty if you do not have that figure."

export function ReportsWorkspace({ client, defaultMonth, maxMonth }: { client: { id: string; name: string }; defaultMonth: string; maxMonth: string }) {
  const [month, setMonth] = useState(defaultMonth)
  const [values, setValues] = useState<MetricInput>({})
  const [previous, setPrevious] = useState<MetricInput>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  const anyValue = Object.values(values).some((v) => v?.trim())

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, month, metrics: values, previous }),
      })
      const body = (await res.json().catch(() => null)) as { report?: Report; error?: string } | null
      if (!res.ok || !body?.report) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      // the figures were validated by the server; build the same cards from what was typed
      const m = toMetrics(values)
      const p = toMetrics(previous)
      setResult({ month: parseMonth(month), clientName: client.name, report: body.report, stats: buildStats(m, Object.keys(p).length ? p : undefined) })
      toast.success("Report generated", { description: "Saved to the client's content history." })
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setError(message)
      toast.error("Couldn't generate the report", { description: message })
    } finally {
      setLoading(false)
    }
  }

  function exportPdf() {
    if (!result) return
    // the browser names the PDF after the page title
    const original = document.title
    document.title = `${result.clientName} - Monthly Report - ${result.month.label}`
    const restore = () => {
      document.title = original
      window.removeEventListener("afterprint", restore)
    }
    window.addEventListener("afterprint", restore)
    window.print()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 print:hidden">
        <div className="space-y-1.5">
          <Label htmlFor="report-month" className="block">
            Month
          </Label>
          <Input id="report-month" type="month" value={month} max={maxMonth} min="2020-01" onChange={(e) => e.target.value && setMonth(e.target.value)} disabled={loading} className="w-48" />
        </div>
        <div className="space-y-1.5">
          <Label className="block">Client</Label>
          <div className="flex h-9 min-w-56 items-center rounded-lg bg-muted px-3 text-sm">{client.name}</div>
        </div>
      </div>

      <Card className="space-y-5 p-5 print:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Performance Data</h2>
          <p className="text-xs text-muted-foreground">{SAMPLE_NOTE}</p>
        </div>
        <MetricGrid idPrefix="m" values={values} onChange={setValues} disabled={loading} />

        <details className="group rounded-lg bg-muted/40 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium marker:text-muted-foreground">Compare with the previous month (optional)</summary>
          <div className="space-y-3 pt-4">
            <p className="text-xs text-muted-foreground">Enter last month&apos;s figures to show up and down arrows on the stat cards and let the report talk about change. Without them the report describes this month only.</p>
            <MetricGrid idPrefix="p" values={previous} onChange={setPrevious} disabled={loading} />
          </div>
        </details>

        <Button size="lg" onClick={generate} disabled={loading || !anyValue} className="h-10 px-4">
          {loading ? <Loader2 className="animate-spin" /> : <Zap />}
          {loading ? "Writing report…" : "Generate Report"}
        </Button>
      </Card>

      {error && <ErrorNote message={error} onRetry={generate} />}

      {result ? (
        <div className="space-y-4">
          <ReportSheet result={result} dim={loading} />
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button size="lg" onClick={exportPdf} className="h-10 px-4">
              <Download /> Export as PDF
            </Button>
            <CopyButton text={renderReportMarkdown(result.clientName, result.month, result.stats, result.report)} label="Copy as text" />
            <Button variant="outline" size="sm" onClick={generate} disabled={loading || !anyValue}>
              <RefreshCw className={loading ? "animate-spin" : undefined} /> Regenerate
            </Button>
            <span className="text-xs text-muted-foreground">Saved to {client.name}&apos;s content history. In the print dialog choose &ldquo;Save as PDF&rdquo;.</span>
          </div>
        </div>
      ) : (
        !error && (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center print:hidden">
            {loading ? <Loader2 className="size-6 animate-spin text-primary" /> : <Zap className="size-6 text-muted-foreground/60" />}
            <p className="max-w-md text-sm text-muted-foreground">{loading ? "Gemini is writing the report." : "Enter this month's figures and generate. You get a summary, key metrics, wins, areas to improve and next month's recommendations, ready to export."}</p>
          </div>
        )
      )}
    </div>
  )
}

function toMetrics(input: MetricInput): Metrics {
  const out: Metrics = {}
  for (const f of METRIC_FIELDS) {
    const text = input[f.id]?.replace(/[,\s]/g, "").replace(/^AED/i, "").replace(/%$/, "")
    if (text) out[f.id] = Number(text)
  }
  return out
}

function MetricGrid({ idPrefix, values, onChange, disabled }: { idPrefix: string; values: MetricInput; onChange: (v: MetricInput) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {METRIC_FIELDS.map((f) => (
        <div key={f.id} className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-${f.id}`} className="text-xs font-normal text-muted-foreground">
            {f.label}
          </Label>
          <Input
            id={`${idPrefix}-${f.id}`}
            inputMode="decimal"
            autoComplete="off"
            value={values[f.id] ?? ""}
            onChange={(e) => onChange({ ...values, [f.id]: e.target.value })}
            placeholder={f.placeholder}
            disabled={disabled}
            className="h-10"
          />
        </div>
      ))}
    </div>
  )
}

function ReportSheet({ result, dim }: { result: Result; dim: boolean }) {
  const { month, report, stats } = result
  return (
    <article id="report-print" className={cn("space-y-7 rounded-xl bg-card p-8 ring-1 ring-foreground/10 print:rounded-none print:p-0 print:ring-0", dim && "opacity-60")}>
      <header className="space-y-1.5">
        <h2 className="text-2xl font-semibold tracking-tight">Monthly Performance Report</h2>
        <p className="text-sm text-muted-foreground">
          {result.clientName} · {month.label}
        </p>
      </header>

      <Section title="Executive Summary">
        <p className="text-sm leading-relaxed">{report.summary}</p>
      </Section>

      <Section title="Key Metrics">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
          {stats.map((s) => (
            <div key={s.id} className="rounded-lg border border-border p-4 [break-inside:avoid]">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold tabular-nums">
                {s.display}
                {s.change && <Change change={s.change} />}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Wins">
        <Bullets items={report.wins} />
      </Section>
      <Section title="Areas to Improve">
        <Bullets items={report.improvements} />
      </Section>
      <Section title={`Recommendations for ${month.nextLabel.split(" ")[0]}`}>
        <Bullets items={report.recommendations} />
      </Section>
    </article>
  )
}

function Change({ change }: { change: NonNullable<Stat["change"]> }) {
  const Icon = change.pct < 0 ? ArrowDown : ArrowUp
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-semibold",
        change.tone === "good" && "text-emerald-600 dark:text-emerald-400",
        change.tone === "bad" && "text-destructive",
        change.tone === "neutral" && "text-muted-foreground"
      )}
    >
      {change.pct !== 0 && <Icon className="size-3" />}
      {Math.abs(change.pct)}%
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 [break-inside:avoid-page]">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Nothing to report this month.</p>
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
      {items.map((i, n) => (
        <li key={n}>{i}</li>
      ))}
    </ul>
  )
}
