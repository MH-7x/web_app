import { cookies, headers } from "next/headers"

import { db } from "@/lib/db"
import { getClientIp } from "@/lib/rate-limit"
import { SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "@/lib/auth-token"
import { WORKER_USER_HEADER, bearerMatches, isWorkerOnly } from "@/lib/worker-auth"

export { signToken, verifyToken, signResetToken, verifyResetToken, SESSION_COOKIE } from "@/lib/auth-token"

export type Session = { userId: string; email: string; name: string; role: string }

const SESSION_USER = { id: true, email: true, name: true, role: true, isActive: true } as const

/** The worker has no logins: the dashboard vouches for the user, on a request that carries the shared secret. */
async function getWorkerSession(): Promise<Session | null> {
  const h = await headers()
  if (!bearerMatches(h.get("authorization"))) return null
  const id = h.get(WORKER_USER_HEADER)
  if (!id) return null
  const user = await db.user.findUnique({ where: { id }, select: SESSION_USER })
  if (!user || !user.isActive) return null
  return { userId: user.id, email: user.email, name: user.name, role: user.role }
}

/**
 * The signed-in user, or null. Every API route calls this itself; proxy.ts is only the first gate.
 *
 * The token alone is not enough: the user is looked up too, so deactivating or deleting an account (or changing its
 * role) takes effect on the next request instead of when a 30-day token runs out. On a worker (WORKER_ONLY) there are
 * no logins at all: see getWorkerSession.
 */
export async function getSession(): Promise<Session | null> {
  if (isWorkerOnly()) return getWorkerSession()
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const claims = await verifySessionToken(token)
  if (!claims) return null
  const user = await db.user.findUnique({ where: { id: claims.userId }, select: SESSION_USER })
  if (!user || !user.isActive) return null
  return { userId: user.id, email: user.email, name: user.name, role: user.role }
}

export async function setSessionCookie(token: string, rememberMe: boolean) {
  ;(await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(rememberMe))
}

export async function clearSessionCookie() {
  ;(await cookies()).delete(SESSION_COOKIE)
}

export type SessionAction = "login" | "logout" | "failed_login" | "password_reset"

/** Add a row to the session log. A logging failure must never break a login, so it is only reported. */
export async function logSessionEvent(userId: string, action: SessionAction, request: Request) {
  try {
    await db.sessionLog.create({
      data: { userId, action, ip: getClientIp(request).slice(0, 64), userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300) },
    })
  } catch (error) {
    console.error("[auth] could not write the session log", error)
  }
}
