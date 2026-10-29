import { NextResponse } from "next/server"

import { logSessionEvent, setSessionCookie, signToken } from "@/lib/auth"
import { db } from "@/lib/db"
import { handleError, readJson } from "@/lib/gbp-posts-api"
import { comparePassword, compareAgainstDummy } from "@/lib/password"
import { normalizeEmail } from "@/lib/password-rules"
import { checkRateLimit, getClientIp, recordFailedAttempt, resetAttempts, retryMessage } from "@/lib/rate-limit"

const INVALID = "Invalid email or password"
const EMAIL_MAX_ATTEMPTS = 10

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const b = await readJson(request)
    const email = normalizeEmail(b.email)
    const password = typeof b.password === "string" ? b.password : ""
    const rememberMe = b.rememberMe === true

    // Two keys: the IP, and the email, so rotating a spoofed x-forwarded-for does not buy unlimited guesses at one account.
    const ipKey = `login:ip:${ip}`
    const emailKey = `login:email:${email}`
    const [byIp, byEmail] = await Promise.all([checkRateLimit(ipKey), checkRateLimit(emailKey, EMAIL_MAX_ATTEMPTS)])
    if (!byIp.allowed || !byEmail.allowed) {
      const retryAfter = Math.max(byIp.retryAfter ?? 0, byEmail.retryAfter ?? 0)
      return NextResponse.json({ error: retryMessage(retryAfter), retryAfter }, { status: 429 })
    }

    const user = email && password ? await db.user.findUnique({ where: { email } }) : null
    const passwordOk = user ? await comparePassword(password, user.passwordHash) : await compareAgainstDummy(password)
    if (!user || !passwordOk) {
      await Promise.all([recordFailedAttempt(ipKey), email ? recordFailedAttempt(emailKey) : undefined])
      if (user) await logSessionEvent(user.id, "failed_login", request)
      return NextResponse.json({ error: INVALID }, { status: 401 })
    }
    // checked after the password so a stranger cannot tell which emails belong to deactivated accounts
    if (!user.isActive) return NextResponse.json({ error: "Account deactivated. Contact your administrator." }, { status: 403 })

    await Promise.all([resetAttempts(ipKey), resetAttempts(emailKey)])
    await setSessionCookie(await signToken({ userId: user.id, email: user.email, role: user.role }, rememberMe), rememberMe)
    await logSessionEvent(user.id, "login", request)
    return NextResponse.json({ user: { name: user.name, email: user.email, role: user.role } })
  } catch (error) {
    return handleError(error, "auth/login")
  }
}
