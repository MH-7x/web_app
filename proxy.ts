import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import {
  PUBLIC_API_ROUTES,
  PUBLIC_FILE_PREFIXES,
  PUBLIC_FILES,
  REFRESH_WITHIN_SECONDS,
  SESSION_COOKIE,
  isPublicPage,
  sessionCookieOptions,
  signToken,
  verifySessionToken,
} from "@/lib/auth-token"
import { db } from "@/lib/db"
import { WORKER_ROUTES, bearerMatches, isWorkerOnly } from "@/lib/worker-auth"

/** A signed token only proves who logged in, not that they still may. Deactivated or deleted users are turned away here. */
async function isActiveUser(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { isActive: true } })
  return user?.isActive === true
}

/**
 * First gate: nothing but the login and setup pages gets through without a valid session cookie.
 * (Next 16 renamed middleware.ts to proxy.ts.)
 *
 * This file is also the only place that can keep a deactivated user out of the PAGES: Next renders a page in parallel
 * with its layouts, so a check in app/layout.tsx cannot stop page data from being produced. That is why the user is
 * looked up here and not just the token verified. Route handlers still call getSession() themselves, so bypassing this
 * file (CVE-2025-29927 style) does not open the API up.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // A worker is not a dashboard: it answers a short list of job routes, only to a caller holding the shared secret.
  if (isWorkerOnly()) {
    if (!WORKER_ROUTES.some((re) => re.test(pathname))) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (pathname !== "/api/health" && !bearerMatches(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.next()
  }

  // the layout reads the path from here; set (and overwritten) on every request so a client cannot choose it
  const headers = new Headers(request.headers)
  headers.set("x-pathname", pathname)
  const pass = () => NextResponse.next({ request: { headers } })

  if (PUBLIC_FILE_PREFIXES.some((p) => pathname.startsWith(p)) || PUBLIC_FILES.includes(pathname)) return pass()
  if (isPublicPage(pathname) || PUBLIC_API_ROUTES.includes(pathname)) return pass()

  const deny = (clearCookie: boolean) => {
    const response = pathname.startsWith("/api/") ? NextResponse.json({ error: "Unauthorized" }, { status: 401 }) : NextResponse.redirect(new URL("/login", request.url))
    if (clearCookie) response.cookies.delete(SESSION_COOKIE)
    return response
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return deny(false)

  const session = await verifySessionToken(token)
  if (!session || !(await isActiveUser(session.userId))) return deny(true)

  const response = pass()
  // silent refresh: close to expiring, so hand back a new token with the same lifetime rules and nobody gets logged out mid-work
  if (session.exp - Math.floor(Date.now() / 1000) < REFRESH_WITHIN_SECONDS) {
    const fresh = await signToken({ userId: session.userId, email: session.email, role: session.role }, session.rememberMe)
    response.cookies.set(SESSION_COOKIE, fresh, sessionCookieOptions(session.rememberMe))
  }
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
