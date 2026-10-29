/**
 * Failed-attempt counter kept in memory. It resets when the server restarts, and it is per process, which is fine for a
 * single-server install. After `max` failures the key is blocked until 15 minutes after the last one.
 */
const WINDOW_MS = 15 * 60 * 1000
const DEFAULT_MAX = 5
const SWEEP_ABOVE = 1000

type Entry = { count: number; resetAt: number }

// kept on globalThis so dev hot reloads (which re-evaluate this file per route) share one table
const g = globalThis as unknown as { __rateLimit?: Map<string, Entry> }
const attempts = (g.__rateLimit ??= new Map<string, Entry>())

function live(key: string, now: number) {
  const e = attempts.get(key)
  if (e && e.resetAt <= now) {
    attempts.delete(key)
    return undefined
  }
  return e
}

export function checkRateLimit(key: string, max = DEFAULT_MAX): { allowed: boolean; remainingAttempts: number; retryAfter?: number } {
  const now = Date.now()
  const e = live(key, now)
  if (!e) return { allowed: true, remainingAttempts: max }
  if (e.count >= max) return { allowed: false, remainingAttempts: 0, retryAfter: Math.max(1, Math.ceil((e.resetAt - now) / 1000)) }
  return { allowed: true, remainingAttempts: max - e.count }
}

export function recordFailedAttempt(key: string) {
  const now = Date.now()
  if (attempts.size > SWEEP_ABOVE) for (const k of attempts.keys()) live(k, now)
  const e = live(key, now)
  attempts.set(key, { count: (e?.count ?? 0) + 1, resetAt: now + WINDOW_MS })
}

export function resetAttempts(key: string) {
  attempts.delete(key)
}

/** The caller's IP. x-forwarded-for is only trustworthy behind a proxy that sets it, so limits are also keyed by email. */
export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown"
}

/** "Try again in 3 minutes." for a 429 message. */
export function retryMessage(retryAfter: number) {
  const minutes = Math.max(1, Math.ceil(retryAfter / 60))
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`
}
