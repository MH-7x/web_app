"use client"

import { CheckCircle2, ExternalLink, Globe, Loader2, Play, Plus, Target, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { AuditLog } from "@/components/seo/audit-log"
import { SpeedPicker } from "@/components/seo/speed-picker"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { JobSnapshot, LogEntry, SpeedSelection } from "@/lib/audit/types"

type Row = { id: number; url: string; keyword: string }

const MAX_ROWS = 30
let nextRowId = 1
const newRow = (url = "", keyword = ""): Row => ({ id: nextRowId++, url, keyword })
const storageKey = (clientId: string) => `seo-audit-pairs:${clientId}`

export function AuditRunner({ clientId, website, lastCrawled, activeJob }: { clientId: string; website: string | null; lastCrawled: string | null; activeJob: JobSnapshot | null }) {
  const router = useRouter()
  const [job, setJob] = useState<JobSnapshot | null>(activeJob)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [sendingSpeed, setSendingSpeed] = useState(false)
  const [entries, setEntries] = useState<LogEntry[]>(activeJob?.log ?? [])
  const jobId = job && (job.status === "queued" || job.status === "running" || job.status === "waiting") ? job.id : null
  const finished = useRef<string | null>(null)
  const rowsLoaded = useRef(false)
  /** how many log entries we hold, so each poll only fetches the newer ones */
  const sinceRef = useRef(activeJob?.log.length ?? 0)

  const mergeLog = useCallback((next: JobSnapshot) => {
    setEntries((prev) => {
      const merged = next.logStart <= prev.length ? [...prev.slice(0, next.logStart), ...next.log] : next.log
      sinceRef.current = merged.length
      return merged
    })
  }, [])

  // The pages and keywords are entered fresh for each audit, but survive leaving this page and coming back during the session.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey(clientId)) ?? "[]") as { url?: unknown; keyword?: unknown }[]
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after mount
      if (Array.isArray(saved) && saved.length) setRows(saved.map((r) => newRow(typeof r.url === "string" ? r.url : "", typeof r.keyword === "string" ? r.keyword : "")))
    } catch {}
    rowsLoaded.current = true
  }, [clientId])

  useEffect(() => {
    if (!rowsLoaded.current) return
    try {
      sessionStorage.setItem(storageKey(clientId), JSON.stringify(rows.map(({ url, keyword }) => ({ url, keyword }))))
    } catch {}
  }, [rows, clientId])

  const updateRow = (id: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const poll = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/seo/audit/${id}?since=${sinceRef.current}`, { cache: "no-store" })
        const body = (await res.json().catch(() => null)) as { job?: JobSnapshot; error?: string } | null
        if (!res.ok || !body?.job) {
          setJob(null)
          setError(body?.error ?? "Lost track of the audit. Start a new one.")
          return
        }
        setJob(body.job)
        mergeLog(body.job)
        if (body.job.status === "failed" && finished.current !== body.job.id) {
          finished.current = body.job.id
          toast.error("The audit failed", { description: body.job.error ?? undefined })
        }
        if (body.job.status === "completed" && body.job.auditId && finished.current !== body.job.id) {
          finished.current = body.job.id
          toast.success("SEO audit complete", { description: "The report is ready below." })
          router.replace(`/seo?audit=${body.job.auditId}`)
          router.refresh()
        }
      } catch {
        // a dropped request: the next tick tries again
      }
    },
    [router, mergeLog]
  )

  useEffect(() => {
    if (!jobId) return
    const timer = setInterval(() => void poll(jobId), 2000)
    return () => clearInterval(timer)
  }, [jobId, poll])

  async function start() {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch("/api/seo/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, keywordPairs: rows.map(({ url, keyword }) => ({ url: url.trim(), keyword: keyword.trim() })) }),
      })
      const body = (await res.json().catch(() => null)) as { job?: JobSnapshot; error?: string } | null
      if (!res.ok || !body?.job) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      setJob(body.job)
      sinceRef.current = 0
      mergeLog(body.job)
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setError(message)
      toast.error("Couldn't start the audit", { description: message })
    } finally {
      setStarting(false)
    }
  }

  /** Answer the speed-test question; the audit carries on and the next poll shows it running. */
  async function chooseSpeedTests(selection: SpeedSelection[]) {
    if (!job) return
    setSendingSpeed(true)
    setError(null)
    try {
      const res = await fetch(`/api/seo/audit/${job.id}/speed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selection }) })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      setJob({ ...job, status: "running", speedCandidates: null, message: selection.length ? "Starting the speed tests" : "Skipping the speed tests" })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.")
    } finally {
      setSendingSpeed(false)
    }
  }

  const running = jobId !== null

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-60 flex-1 items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
            <Globe className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{website ?? "No website saved for this client"}</span>
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer" aria-label="Open website" className="text-muted-foreground hover:text-foreground">
                <ExternalLink className="size-4" />
              </a>
            )}
          </div>
          <span className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <span className={lastCrawled ? "size-1.5 rounded-full bg-emerald-500" : "size-1.5 rounded-full bg-muted-foreground/50"} />
            {lastCrawled ? `Crawled: ${lastCrawled}` : "Never audited"}
          </span>
          <Button size="lg" id="seo-start-audit" onClick={start} disabled={!website || running || starting}>
            {running || starting ? <Loader2 className="animate-spin" /> : <Play />}
            {running ? "Audit running…" : "Start New Audit"}
          </Button>
        </div>

        <section aria-label="Pages and keywords to check" className="space-y-3 border-t border-border pt-4">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <Target className="size-3.5 text-muted-foreground" /> Pages &amp; Keywords to Check <span className="font-normal text-muted-foreground">(optional)</span>
            </h3>
            <p className="text-xs text-muted-foreground">For each page, checks that its keyword appears in the title, H1, first 100 words, URL and meta description. Leave empty to skip keyword checks.</p>
          </div>
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr_1fr_2.25rem] gap-2 text-xs font-medium text-muted-foreground sm:grid">
                <span>Page URL or path</span>
                <span>Primary keyword</span>
                <span />
              </div>
              {rows.map((r, i) => (
                <div key={r.id} className="grid grid-cols-[1fr_2.25rem] gap-2 sm:grid-cols-[1fr_1fr_2.25rem]">
                  <Input aria-label={`Page ${i + 1} URL or path`} value={r.url} onChange={(e) => updateRow(r.id, { url: e.target.value })} placeholder="/services/villa-moving" inputMode="url" spellCheck={false} disabled={running} />
                  <Input aria-label={`Page ${i + 1} keyword`} value={r.keyword} onChange={(e) => updateRow(r.id, { keyword: e.target.value })} placeholder="villa movers dubai" maxLength={100} disabled={running} className="max-sm:order-3 max-sm:col-span-2" />
                  <Button type="button" variant="outline" size="icon" aria-label={`Remove page ${i + 1}`} onClick={() => setRows((all) => all.filter((x) => x.id !== r.id))} disabled={running} className="size-9 max-sm:order-2">
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((all) => [...all, newRow()])} disabled={running || rows.length >= MAX_ROWS}>
            <Plus /> Add Page
          </Button>
        </section>
        <p className="text-xs text-muted-foreground">An audit crawls up to 150 pages and runs speed tests, so it takes about 8 to 15 minutes. You can leave this page and come back.</p>
      </Card>

      {error && <ErrorNote message={error} />}
      {job?.status === "failed" && <ErrorNote message={job.error ?? "The audit failed."} onRetry={website ? start : undefined} />}
      {job?.status === "failed" && <AuditLog entries={entries} />}

      {job?.status === "waiting" && job.speedCandidates && <SpeedPicker candidates={job.speedCandidates} busy={sendingSpeed} onRun={chooseSpeedTests} />}

      {job && (job.status === "queued" || job.status === "running" || job.status === "waiting" || job.status === "completed") && (
        <Card className="space-y-4 p-5" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-semibold">
              {job.status === "completed" ? <CheckCircle2 className="size-4 text-emerald-500" /> : <Loader2 className="size-4 animate-spin text-primary" />}
              {job.status === "queued" ? "Waiting in line" : job.status === "completed" ? "Audit complete" : job.status === "waiting" ? "Waiting for your choice" : "Auditing your website"}
            </h3>
            <span className="text-sm text-muted-foreground tabular-nums">
              {job.pagesCrawled > 0 && `${job.pagesCrawled} ${job.pagesCrawled === 1 ? "page" : "pages"} · `}
              {job.progress}%
            </span>
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress} aria-label="Audit progress" className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${job.progress}%` }} />
          </div>
          <p className="text-sm font-medium">{job.message}</p>
          {/* once complete, the saved report below carries the same log */}
          {job.status !== "completed" && <AuditLog entries={entries} />}
        </Card>
      )}
    </div>
  )
}
