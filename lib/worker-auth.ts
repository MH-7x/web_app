import { createHash, timingSafeEqual } from "node:crypto"

/**
 * The long-running jobs (SEO audit, GBP post writing, competitor pages) need a real server with Chrome, which Vercel
 * cannot give them. They run on a separate "worker" deployment of this same app, started with WORKER_ONLY=true. This
 * file is the worker's door: which paths it answers and how it recognises the dashboard. No database access, so
 * proxy.ts can import it.
 */
export const isWorkerOnly = () => process.env.WORKER_ONLY === "true"

/** The only paths a worker answers. Everything else is a 404, so a worker is not a second copy of the dashboard. */
export const WORKER_ROUTES = [
  /^\/api\/health$/,
  /^\/api\/seo\/audit$/,
  /^\/api\/seo\/audit\/active$/,
  /^\/api\/seo\/audit\/[^/]+$/,
  /^\/api\/seo\/audit\/[^/]+\/speed$/,
  /^\/api\/gbp-posts\/generate$/,
  /^\/api\/gbp-posts\/jobs\/active$/,
  /^\/api\/gbp-posts\/jobs\/[^/]+$/,
  /^\/api\/content\/landing-page\/competitors$/,
]

/** The dashboard names the signed-in user here; the worker trusts it only on a request that carries the shared secret. */
export const WORKER_USER_HEADER = "x-worker-user"

export function workerSecret() {
  const s = process.env.AUDIT_WORKER_SECRET
  if (!s || s.length < 32) throw new Error("AUDIT_WORKER_SECRET is missing or too short (use 32+ random characters).")
  return s
}

const digest = (v: string) => createHash("sha256").update(v).digest()

/** Does an `Authorization: Bearer <secret>` header carry the shared secret? Constant-time. */
export function bearerMatches(header: string | null) {
  const m = /^Bearer (.+)$/.exec(header ?? "")
  if (!m) return false
  return timingSafeEqual(digest(m[1]), digest(workerSecret()))
}
