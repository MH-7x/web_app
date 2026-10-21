import { browserPort, launchBrowser } from "@/lib/audit/browser"
import { buildContext, type ClientProfile } from "@/lib/audit/checks/util"
import { AUDIT_CONFIG } from "@/lib/audit/config"
import { crawlSite, type CrawlProgress } from "@/lib/audit/crawler"
import { fetchCrux } from "@/lib/audit/crux"
import { runChecks } from "@/lib/audit/engine"
import { runLighthouse } from "@/lib/audit/lighthouse"
import type { AuditInput, JobSnapshot, LighthouseRun } from "@/lib/audit/types"
import { db } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"

/**
 * In-memory audit jobs (no Redis). They live in this server process: restarting the server drops running jobs, and
 * only one audit runs at a time because crawling plus Lighthouse is heavy. Finished audits are saved to the database.
 */

const KEEP_MS = 60 * 60 * 1000
const LOG_LINES = 12

type Job = JobSnapshot & { startedAt: number; finishedAt?: number }
type Store = { jobs: Map<string, Job>; tail: Promise<unknown> }

// kept on globalThis so dev-server hot reloads do not forget running jobs
const g = globalThis as unknown as { __auditJobs?: Store }
const store: Store = (g.__auditJobs ??= { jobs: new Map(), tail: Promise.resolve() })

const snapshot = (job: Job): JobSnapshot => ({
  id: job.id,
  clientId: job.clientId,
  url: job.url,
  status: job.status,
  progress: job.progress,
  phase: job.phase,
  message: job.message,
  log: [...job.log],
  pagesCrawled: job.pagesCrawled,
  auditId: job.auditId,
  error: job.error,
})

function update(job: Job, patch: Partial<Pick<Job, "status" | "progress" | "phase" | "message" | "pagesCrawled" | "auditId" | "error">>) {
  Object.assign(job, patch)
  if (patch.message && job.log[job.log.length - 1] !== patch.message) job.log = [...job.log, patch.message].slice(-LOG_LINES)
}

/** Map a crawler step onto the overall 0-100 bar: crawl 5-50, links 50-62, probes 64. Speed tests take 66-92. */
function progressFor(p: CrawlProgress) {
  const frac = p.total > 0 ? Math.min(1, p.done / p.total) : 0
  if (p.phase === "crawl") return Math.round(5 + frac * 45)
  if (p.phase === "links") return Math.round(50 + frac * 12)
  if (p.phase === "probes") return 64
  return 4
}

async function run(job: Job, client: ClientProfile, input: AuditInput) {
  update(job, { status: "running", progress: 3, phase: "start", message: "Starting the crawler" })
  const started = Date.now()
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined
  try {
    browser = await launchBrowser()
    const crawl = await crawlSite(browser, job.url, {
      onProgress: (p) => update(job, { phase: p.phase, message: p.message, progress: progressFor(p), pagesCrawled: p.phase === "crawl" ? p.done : job.pagesCrawled }),
    })
    update(job, { pagesCrawled: crawl.pages.length })
    if (crawl.pages.length === 0) {
      const why = crawl.errors[0]?.message
      throw new Error(`The site could not be crawled: no page loaded${why ? ` (${why})` : ""}. Check the address and that the site is online.`)
    }

    /* ---- Lighthouse: the homepage on mobile and desktop, plus the strongest landing pages on mobile ---- */
    const draft = buildContext({ crawl, client, audit: input, lighthouse: [], crux: null })
    const home = draft.home?.url ?? crawl.startUrl
    const landing = [...draft.servicePages, ...draft.areaPages]
      .filter((p) => p.status === 200)
      .sort((a, b) => b.inlinks - a.inlinks)
      .slice(0, AUDIT_CONFIG.lighthouseLandingPages)
      .map((p) => p.url)
    const plan: { url: string; device: "mobile" | "desktop" }[] = [
      { url: home, device: "mobile" },
      { url: home, device: "desktop" },
      ...landing.map((url) => ({ url, device: "mobile" as const })),
    ]
    const lighthouse: LighthouseRun[] = []
    for (const [i, step] of plan.entries()) {
      update(job, { phase: "speed", progress: 66 + Math.round((i / plan.length) * 26), message: `Speed test ${i + 1} of ${plan.length}: ${new URL(step.url).pathname || "/"} (${step.device}), about a minute` })
      const run = await runLighthouse(step.url, browserPort(browser), step.device)
      if (run) lighthouse.push(run)
    }
    update(job, { message: lighthouse.length ? `Speed tests finished (${lighthouse.length} of ${plan.length} completed)` : "Lighthouse could not run; speed figures will be estimated", progress: 92 })

    /* ---- real-user data ---- */
    update(job, { phase: "field", progress: 93, message: "Fetching real-user Core Web Vitals (Chrome UX Report)" })
    const crux = await fetchCrux([home, ...landing], crawl.origin)

    update(job, { phase: "analyze", progress: 95, message: "Running checks" })
    const { scores, payload, recommendations } = runChecks({ crawl, client, audit: input, lighthouse, crux, durationSec: Math.round((Date.now() - started) / 1000) })

    const saved = await db.audit.create({
      data: {
        clientId: job.clientId,
        url: job.url,
        scores: scores as unknown as Prisma.InputJsonValue,
        findings: payload as unknown as Prisma.InputJsonValue,
        recommendations: recommendations as unknown as Prisma.InputJsonValue,
      },
    })
    update(job, { status: "completed", progress: 100, phase: "done", message: `Audit complete: ${scores.overall}/100 (${scores.grade})`, auditId: saved.id })
  } catch (error) {
    console.error("[audit]", error)
    update(job, { status: "failed", phase: "failed", message: "Audit failed", error: error instanceof Error ? error.message : "The audit failed." })
  } finally {
    job.finishedAt = Date.now()
    await browser?.close().catch(() => {})
  }
}

function sweep() {
  const now = Date.now()
  for (const [id, job] of store.jobs) if (job.finishedAt && now - job.finishedAt > KEEP_MS) store.jobs.delete(id)
}

export function getJob(id: string) {
  const job = store.jobs.get(id)
  return job ? snapshot(job) : null
}

/** The queued or running job for a client, if any. */
export function getActiveJob(clientId: string) {
  for (const job of store.jobs.values()) if (job.clientId === clientId && (job.status === "queued" || job.status === "running")) return snapshot(job)
  return null
}

/** Start an audit, or return the one already running for this client. */
export function startAudit(clientId: string, url: string, client: ClientProfile, input: AuditInput): JobSnapshot {
  sweep()
  const existing = getActiveJob(clientId)
  if (existing) return existing

  const job: Job = {
    id: crypto.randomUUID(),
    clientId,
    url,
    status: "queued",
    progress: 0,
    phase: "queued",
    message: "Waiting for another audit to finish",
    log: [],
    pagesCrawled: 0,
    auditId: null,
    error: null,
    startedAt: Date.now(),
  }
  store.jobs.set(job.id, job)
  store.tail = store.tail.then(() => run(job, client, input)).catch(() => {})
  return snapshot(job)
}
