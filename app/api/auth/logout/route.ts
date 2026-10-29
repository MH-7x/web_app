import { NextResponse } from "next/server"

import { clearSessionCookie, getSession, logSessionEvent } from "@/lib/auth"
import { handleError } from "@/lib/gbp-posts-api"

/** Public on purpose: a browser holding an expired cookie must still be able to clear it. */
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (session) await logSessionEvent(session.userId, "logout", request)
    await clearSessionCookie()
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleError(error, "auth/logout")
  }
}
