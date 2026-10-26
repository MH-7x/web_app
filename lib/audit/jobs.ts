import { browserPort, launchBrowser } from "@/lib/audit/browser"
import { buildContext, type ClientProfile } from "@/lib/audit/checks/util"
import { AUDIT_CONFIG } from "@/lib/audit/config"
import { crawlSite, type CrawlProgress } from "@/lib/audit/crawler"
import { fetchCrux } from "@/lib/audit/crux"
import { runChecks } from "@/lib/audit/engine"
import { logEntry } from "@/lib/audit/log"
import { runLighthouse } from "@/lib/audit/lighthouse"
import type { AuditInput, JobSnapshot, LighthouseRun, LogLevel, SpeedCandidate, SpeedSelection } from "@/lib/audit/types"
import { db } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"

/**
 * In-memory audit jobs (no Redis). They live in this server process: restarting the server drops running jobs, and
 * only one audit runs at a time because crawling plus Lighthouse is heavy. Finished audits are saved to the database.
 */

const KEEP_MS = 60 * 60 * 1000
/** A runaway crawl cannot grow a job without limit. */
const MAX_LOG_ENTRIES = 5000
/** An abandoned audit must not block the queue for ever: after this long it carries on with the suggested pages. */
const SELECTION_WAIT_MS = 20 * 60 * 1000
/** Each speed test takes about a minute, so cap what one audit can ask for. */
export const MAX_SPEED_TESTS = 20

type Job = Omit<JobSnapshot, "logStart" | "speedCandidates"> & {
  startedAt: number
  finishedAt?: number
  /** set while the audit waits for the user to pick pages to speed test */
  awaiting?: { candidates: SpeedCandidate[]; resolve: (selection: SpeedSelection[]) => void }
}
type Store = { jobs: Map<string, Job>; tail: Promise<unknown> }

// kept on globalThis so dev-server hot reloads do not forget running jobs
const g = globalThis as unknown as { __auditJobs?: Store }
const store: Store = (g.__auditJobs ??= { jobs: new Map(), tail: Promise.resolve() })

/** `since` is how many log entries the caller already has; only the newer ones are returned. */
const snapshot = (job: Job, since = 0): JobSnapshot => ({
  id: job.id,
  clientId: job.clientId,
  url: job.url,
  status: job.status,
  progress: job.progress,
  phase: job.phase,
  message: job.message,
  speedCandidates: job.status === "waiting" ? (job.awaiting?.candidates ?? null) : null,
  log: job.log.slice(since),
  logStart: Math.min(since, job.log.length),
  pagesCrawled: job.pagesCrawled,
  auditId: job.auditId,
  error: job.error,
})

function update(job: Job, patch: Partial<Pick<Job, "status" | "progress" | "phase" | "message" | "pagesCrawled" | "auditId" | "error">>) {
  Object.assign(job, patch)
}

function log(job: Job, level: LogLevel, message: string) {
  if (job.log.length < MAX_LOG_ENTRIES) job.log.push(logEntry(level, message))
}

/** Map a crawler step onto the overall 0-100 bar: crawl 5-50, links 50-62, probes 64. Speed tests take 66-92. */
function progressFor(p: CrawlProgress) {
  const frac = p.total > 0 ? Math.min(1, p.done / p.total) : 0
  if (p.phase === "crawl") return Math.round(5 + frac * 45)
  if (p.phase === "links") return Math.round(50 + frac * 12)
  if (p.phase === "probes") return 64
  return 4
}

/** Pause the audit until the user chooses pages to speed test (or the wait runs out, or they skip). */
function askForSpeedPlan(job: Job, candidates: SpeedCandidate[], fallback: SpeedSelection[], write: (level: LogLevel, message: string) => void) {
  return new Promise<SpeedSelection[]>((resolve) => {
    const timer = setTimeout(() => {
      write("warn", `No choice was made within ${SELECTION_WAIT_MS / 60000} minutes, so the suggested pages are being tested`)
      finish(fallback)
    }, SELECTION_WAIT_MS)
    function finish(selection: SpeedSelection[]) {
      clearTimeout(timer)
      job.awaiting = undefined
      resolve(selection)
    }
    job.awaiting = { candidates, resolve: finish }
    update(job, { status: "waiting", phase: "speed-select", progress: 64, message: "Choose the pages to speed test" })
  })
}

/** The user's answer: the pages and devices to test (empty to skip). Returns an error message when it cannot be used. */
export function submitSpeedSelection(jobId: string, selection: SpeedSelection[]): string | null {
  const job = store.jobs.get(jobId)
  if (!job) return "This audit is no longer running (the server may have restarted)."
  if (job.status !== "waiting" || !job.awaiting) return "This audit is not waiting for a choice."
  const known = new Set(job.awaiting.candidates.map((c) => c.url))
  const unique = [...new Map(selection.map((s) => [`${s.url}|${s.device}`, s])).values()]
  if (unique.some((s) => !known.has(s.url) || (s.device !== "mobile" && s.device !== "desktop"))) return "One of the chosen pages was not part of the crawl."
  if (unique.length > MAX_SPEED_TESTS) return `Choose at most ${MAX_SPEED_TESTS} speed tests.`
  log(job, "info", unique.length ? `${unique.length} speed ${unique.length === 1 ? "test" : "tests"} chosen` : "Speed tests skipped")
  job.awaiting.resolve(unique)
  return null
}

async function run(job: Job, client: ClientProfile, input: AuditInput) {
  update(job, { status: "running", progress: 3, phase: "start", message: "Starting the crawler" })
  const write = (level: LogLevel, message: string) => log(job, level, message)
  write("info", `Audit started for ${job.url}`)
  if (input.keywordPairs.length) write("info", `${input.keywordPairs.length} ${input.keywordPairs.length === 1 ? "page" : "pages"} with keywords to check`)
  const started = Date.now()
  /** time spent waiting for the user, which is not audit time */
  let waited = 0
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined
  try {
    browser = await launchBrowser()
    const crawl = await crawlSite(browser, job.url, {
      log: write,
      onProgress: (p) => update(job, { phase: p.phase, message: p.message, progress: progressFor(p), pagesCrawled: p.phase === "crawl" ? p.done : job.pagesCrawled }),
    })
    update(job, { pagesCrawled: crawl.pages.length })
    write("info", `Crawl complete: ${crawl.pages.length} pages loaded`)
    if (crawl.pages.length === 0) {
      const why = crawl.errors[0]?.message
      throw new Error(`The site could not be crawled: no page loaded${why ? ` (${why})` : ""}. Check the address and that the site is online.`)
    }

    /* ---- Lighthouse: the user picks which of the crawled pages to test ---- */
    const draft = buildContext({ crawl, client, audit: input, lighthouse: [], crux: null })
    const home = draft.home?.url ?? crawl.startUrl
    const landing = new Set(
      [...draft.servicePages, ...draft.areaPages]
        .filter((p) => p.status === 200)
        .sort((a, b) => b.inlinks - a.inlinks)
        .slice(0, AUDIT_CONFIG.lighthouseLandingPages)
        .map((p) => p.url)
    )
    const candidates: SpeedCandidate[] = draft.html.map((p) => ({
      url: p.url,
      path: p.path,
      title: p.raw?.title ?? "",
      inlinks: p.inlinks,
      suggested: p.url === home ? ["mobile", "desktop"] : landing.has(p.url) ? ["mobile"] : [],
    }))
    const suggested = candidates.flatMap((c) => c.suggested.map((device) => ({ url: c.url, device })))

    write("info", `Crawl finished. Waiting for you to choose which of the ${candidates.length} pages to speed test`)
    const waitStart = Date.now()
    const plan = await askForSpeedPlan(job, candidates, suggested, write)
    waited += Date.now() - waitStart

    const lighthouse: LighthouseRun[] = []
    if (plan.length === 0) write("info", "No pages were chosen, so speed tests were skipped")
    for (const [i, step] of plan.entries()) {
      update(job, { status: "running", phase: "speed", progress: 66 + Math.round((i / plan.length) * 26), message: `Speed test ${i + 1} of ${plan.length}: ${new URL(step.url).pathname || "/"} (${step.device}), about a minute` })
      write("info", `Speed test ${i + 1} of ${plan.length} started: ${new URL(step.url).pathname || "/"} (${step.device})`)
      const run = await runLighthouse(step.url, browserPort(browser), step.device)
      if (run) {
        lighthouse.push(run)
        write(run.score >= 50 ? "info" : "warn", `Speed test ${i + 1} of ${plan.length} finished: score ${run.score}/100 (${step.device})`)
      } else write("warn", `Speed test ${i + 1} of ${plan.length} failed or timed out (${step.device})`)
    }
    update(job, { status: "running", message: plan.length === 0 ? "Speed tests skipped; speed figures will be estimated" : lighthouse.length ? `Speed tests finished (${lighthouse.length} of ${plan.length} completed)` : "Lighthouse could not run; speed figures will be estimated", progress: 92 })

    /* ---- real-user data ---- */
    update(job, { phase: "field", progress: 93, message: "Fetching real-user Core Web Vitals (Chrome UX Report)" })
    const crux = await fetchCrux([home, ...new Set(plan.map((s) => s.url).filter((u) => u !== home))].slice(0, 6), crawl.origin)
    write(crux.unavailable ? "warn" : "info", crux.unavailable ? `Chrome UX Report unavailable: ${crux.unavailable}` : `Chrome UX Report loaded (${crux.records.length} records)`)

    update(job, { phase: "analyze", progress: 95, message: "Running checks" })
    const { scores, payload, recommendations, keywordChecks } = runChecks({ crawl, client, audit: input, lighthouse, crux, durationSec: Math.round((Date.now() - started - waited) / 1000), log: write })
    write("info", `Audit complete: ${scores.overall}/100 (${scores.grade})`)

    const saved = await db.audit.create({
      data: {
        clientId: job.clientId,
        url: job.url,
        scores: scores as unknown as Prisma.InputJsonValue,
        findings: payload as unknown as Prisma.InputJsonValue,
        recommendations: recommendations as unknown as Prisma.InputJsonValue,
        log: JSON.stringify(job.log),
        keywordChecks: JSON.stringify(keywordChecks),
      },
    })
    update(job, { status: "completed", progress: 100, phase: "done", message: `Audit complete: ${scores.overall}/100 (${scores.grade})`, auditId: saved.id })
  } catch (error) {
    console.error("[audit]", error)
    write("error", error instanceof Error ? error.message : "The audit failed.")
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

export function getJob(id: string, since = 0) {
  const job = store.jobs.get(id)
  return job ? snapshot(job, since) : null
}

/** The queued or running job for a client, if any. */
export function getActiveJob(clientId: string) {
  for (const job of store.jobs.values()) if (job.clientId === clientId && (job.status === "queued" || job.status === "running" || job.status === "waiting")) return snapshot(job)
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
