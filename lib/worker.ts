import { WORKER_USER_HEADER, workerSecret } from "@/lib/worker-auth"

/**
 * The dashboard's side of the worker: where it is, and how to hand a request to it. With AUDIT_WORKER_URL unset (local
 * development, or a single server that does everything) nothing is forwarded and the jobs run in this process.
 */
export function workerBaseUrl() {
  const url = process.env.AUDIT_WORKER_URL?.trim()
  return url ? url.replace(/\/+$/, "") : null
}

const unreachable = () => Response.json({ error: "The audit server is not reachable right now. Try again in a moment, and tell your administrator if it keeps happening." }, { status: 503 })

async function call(path: string, init: { method: string; body?: BodyInit | null; contentType?: string | null; userId: string; timeoutMs: number }) {
  const base = workerBaseUrl()!
  try {
    return await fetch(base + path, {
      method: init.method,
      headers: {
        authorization: `Bearer ${workerSecret()}`,
        [WORKER_USER_HEADER]: init.userId,
        ...(init.contentType ? { "content-type": init.contentType } : {}),
      },
      body: init.body,
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeoutMs),
    })
  } catch (error) {
    console.error("[worker] request failed:", path, error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Hand the incoming request to the worker and relay its answer as-is. Returns null when no worker is configured, so the
 * caller carries on and does the job itself. Call it after the dashboard's own login check.
 */
export async function forwardToWorker(request: Request, userId: string, { timeoutMs = 30_000 }: { timeoutMs?: number } = {}): Promise<Response | null> {
  if (!workerBaseUrl()) return null
  const url = new URL(request.url)
  const hasBody = request.method !== "GET" && request.method !== "HEAD"
  const res = await call(url.pathname + url.search, {
    method: request.method,
    body: hasBody ? await request.arrayBuffer() : undefined,
    contentType: request.headers.get("content-type"),
    userId,
    timeoutMs,
  })
  if (!res) return unreachable()
  const headers = new Headers()
  for (const name of ["content-type", "content-disposition", "cache-control"]) {
    const v = res.headers.get(name)
    if (v) headers.set(name, v)
  }
  return new Response(res.body, { status: res.status, headers })
}

/** GET a worker route from server code (a page). null if the worker is not configured or does not answer. */
export async function workerGetJson<T>(path: string, userId: string): Promise<T | null> {
  if (!workerBaseUrl()) return null
  const res = await call(path, { method: "GET", userId, timeoutMs: 10_000 })
  if (!res?.ok) return null
  return (await res.json().catch(() => null)) as T | null
}
