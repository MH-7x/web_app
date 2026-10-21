import type { ClientDetail } from "@/lib/clients"
import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { toStoredDate, dateKey, weekStart, type PostLanguage } from "@/lib/gbp-posts-types"
import { planSlots, writePosts, type GeneratedPost } from "@/lib/generators/gbp-posts"
import { GeminiError } from "@/lib/gemini"

/**
 * In-memory jobs for writing posts. A run of 3 posts a week for several weeks takes minutes, so it runs in the
 * background: each batch is saved as soon as it is written (posts appear on the calendar as they arrive), and the page
 * polls for progress. Jobs live in this server process; one runs at a time to stay inside Gemini's rate limits.
 */

export type GbpJobSnapshot = {
  id: string
  clientId: string
  status: "queued" | "running" | "completed" | "failed"
  total: number
  written: number
  message: string
  error: string | null
  /** earliest scheduled day among the planned posts, so the UI can jump to its month */
  firstDate: string | null
}

type Job = GbpJobSnapshot & { finishedAt?: number }
type Store = { jobs: Map<string, Job>; tail: Promise<unknown> }

const g = globalThis as unknown as { __gbpJobs?: Store }
const store: Store = (g.__gbpJobs ??= { jobs: new Map(), tail: Promise.resolve() })

const KEEP_MS = 60 * 60 * 1000
const snapshot = (j: Job): GbpJobSnapshot => ({ id: j.id, clientId: j.clientId, status: j.status, total: j.total, written: j.written, message: j.message, error: j.error, firstDate: j.firstDate })

function save(clientId: string, posts: GeneratedPost[]) {
  return db.$transaction(
    posts.map((p) =>
      db.gBPPost.create({
        data: {
          clientId,
          scheduledDate: toStoredDate(p.date),
          category: p.category,
          language: p.language,
          postType: p.postType,
          cta: p.cta,
          textAr: p.textAr,
          textEn: p.textEn,
          keywords: p.keywords,
          imagePrompt: p.imagePrompt,
        },
      })
    )
  )
}

async function run(job: Job, client: ClientDetail, slots: Parameters<typeof writePosts>[1], language: PostLanguage) {
  job.status = "running"
  job.message = "Writing the first posts"
  try {
    await writePosts(client, slots, language, async (posts, done) => {
      await save(client.id, posts)
      job.written = done
      job.message = done >= job.total ? "Finishing up" : `Written ${done} of ${job.total} posts`
    })
    job.status = "completed"
    job.message = `${job.written} posts added as drafts`
  } catch (error) {
    console.error("[gbp-posts job]", error)
    job.status = "failed"
    job.error = (error instanceof GeminiError ? error.message : "Something went wrong while writing the posts.") + (job.written > 0 ? ` ${job.written} of ${job.total} posts were saved before it stopped.` : "")
    job.message = "Stopped"
  } finally {
    job.finishedAt = Date.now()
  }
}

export function getGbpJob(id: string) {
  const job = store.jobs.get(id)
  return job ? snapshot(job) : null
}

export function getActiveGbpJob(clientId: string) {
  for (const job of store.jobs.values()) if (job.clientId === clientId && (job.status === "queued" || job.status === "running")) return snapshot(job)
  return null
}

/** Plan the weeks, then start writing in the background. Returns the job to poll. */
export async function startPostsJob(client: ClientDetail, input: { weeks: number; keywords: string[]; language: PostLanguage; startDate: string }): Promise<GbpJobSnapshot> {
  const now = Date.now()
  for (const [id, j] of store.jobs) if (j.finishedAt && now - j.finishedAt > KEEP_MS) store.jobs.delete(id)

  const active = getActiveGbpJob(client.id)
  if (active) return active

  const existing = await db.gBPPost.findMany({ where: { clientId: client.id, scheduledDate: { gte: toStoredDate(weekStart(input.startDate)) } }, select: { scheduledDate: true } })
  const slots = planSlots(client, input.weeks, input.startDate, input.keywords, existing.map((p) => dateKey(p.scheduledDate)))
  if (!slots.length) throw new BadRequestError("Every week from that date already has 3 posts. Choose a later start date.")

  const job: Job = {
    id: crypto.randomUUID(),
    clientId: client.id,
    status: "queued",
    total: slots.length,
    written: 0,
    message: "Waiting for another job to finish",
    error: null,
    firstDate: slots[0].date,
  }
  store.jobs.set(job.id, job)
  store.tail = store.tail.then(() => run(job, client, slots, input.language)).catch(() => {})
  return snapshot(job)
}
