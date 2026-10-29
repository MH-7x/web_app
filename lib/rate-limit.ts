import { db } from "@/lib/db"

/**
 * Failed-attempt counter. It lives in the RateLimit table rather than in memory: on a serverless host every request may
 * land on a different instance, so an in-memory counter would never reach its limit. After `max` failures a key is
 * blocked until 15 minutes after the last one.
 */
const WINDOW_MS = 15 * 60 * 1000
const DEFAULT_MAX = 5

export async function checkRateLimit(key: string, max = DEFAULT_MAX): Promise<{ allowed: boolean; remainingAttempts: number; retryAfter?: number }> {
  const row = await db.rateLimit.findUnique({ where: { key } })
  const now = Date.now()
  if (!row || row.resetAt.getTime() <= now) return { allowed: true, remainingAttempts: max }
  if (row.count >= max) return { allowed: false, remainingAttempts: 0, retryAfter: Math.max(1, Math.ceil((row.resetAt.getTime() - now) / 1000)) }
  return { allowed: true, remainingAttempts: max - row.count }
}

export async function recordFailedAttempt(key: string) {
  const resetAt = new Date(Date.now() + WINDOW_MS)
  // One atomic statement, so two simultaneous failures both count. A window that has already passed starts over at 1.
  // resetAt is "timestamp without time zone" holding UTC, hence the explicit AT TIME ZONE 'UTC' on the comparison.
  await db.$executeRaw`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" <= (NOW() AT TIME ZONE 'UTC') THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = ${resetAt}`
  // housekeeping: rows whose window has passed carry no information
  await db.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } })
}

export async function resetAttempts(key: string) {
  await db.rateLimit.deleteMany({ where: { key } })
}

/** The caller's IP. x-forwarded-for is only trustworthy behind a proxy that sets it (Vercel does), so limits are also keyed by email. */
export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown"
}

/** "Try again in 3 minutes." for a 429 message. */
export function retryMessage(retryAfter: number) {
  const minutes = Math.max(1, Math.ceil(retryAfter / 60))
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`
}
