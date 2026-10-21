"use client"

import { CheckCircle2, ExternalLink, Globe, Loader2, Play, Target } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label } from "@/components/ui/input"
import type { JobSnapshot } from "@/lib/audit/types"

export function AuditRunner({ clientId, website, lastCrawled, activeJob }: { clientId: string; website: string | null; lastCrawled: string | null; activeJob: JobSnapshot | null }) {
  const router = useRouter()
  const [job, setJob] = useState<JobSnapshot | null>(activeJob)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [keyword, setKeyword] = useState("")
  const [targetUrl, setTargetUrl] = useState("")
  const jobId = job && (job.status === "queued" || job.status === "running") ? job.id : null
  const finished = useRef<string | null>(null)

  const poll = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/seo/audit/${id}`, { cache: "no-store" })
        const body = (await res.json().catch(() => null)) as { job?: JobSnapshot; error?: string } | null
        if (!res.ok || !body?.job) {
          setJob(null)
          setError(body?.error ?? "Lost track of the audit. Start a new one.")
          return
        }
        setJob(body.job)
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
    [router]
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
        body: JSON.stringify({ clientId, targetKeyword: keyword.trim(), targetUrl: targetUrl.trim() }),
      })
      const body = (await res.json().catch(() => null)) as { job?: JobSnapshot; error?: string } | null
      if (!res.ok || !body?.job) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      setJob(body.job)
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setError(message)
      toast.error("Couldn't start the audit", { description: message })
    } finally {
      setStarting(false)
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

        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="audit-keyword" className="flex items-center gap-1.5">
              <Target className="size-3.5 text-muted-foreground" /> Target keyword <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="audit-keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. movers and packers in Dubai" maxLength={100} disabled={running} />
            <p className="text-xs text-muted-foreground">Checks it appears in the title, H1, first 100 words, URL and meta description, without stuffing. Left blank, these checks are skipped.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-target">
              Page the keyword is for <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="audit-target" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="Defaults to the homepage" inputMode="url" disabled={running} />
            <p className="text-xs text-muted-foreground">A page on the same website, such as a service or area page.</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">An audit crawls up to 150 pages and runs speed tests, so it takes about 8 to 15 minutes. You can leave this page and come back.</p>
      </Card>

      {error && <ErrorNote message={error} />}
      {job?.status === "failed" && <ErrorNote message={job.error ?? "The audit failed."} onRetry={website ? start : undefined} />}

      {job && (job.status === "queued" || job.status === "running" || job.status === "completed") && (
        <Card className="space-y-4 p-5" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-semibold">
              {job.status === "completed" ? <CheckCircle2 className="size-4 text-emerald-500" /> : <Loader2 className="size-4 animate-spin text-primary" />}
              {job.status === "queued" ? "Waiting in line" : job.status === "completed" ? "Audit complete" : "Auditing your website"}
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
          {job.log.length > 1 && (
            <ul className="space-y-0.5 rounded-lg bg-muted/60 p-3 font-mono text-xs text-muted-foreground">
              {job.log.slice(-6).map((line, i, all) => (
                <li key={`${i}-${line}`} className={i === all.length - 1 ? "text-foreground" : undefined}>
                  {i === all.length - 1 ? "› " : "  "}
                  {line}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}
