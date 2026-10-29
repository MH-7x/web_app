import { NextResponse } from "next/server"

import { logSessionEvent, signResetToken, verifyResetToken } from "@/lib/auth"
import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { handleError, readJson } from "@/lib/gbp-posts-api"
import { comparePassword, compareAgainstDummy, hashPassword } from "@/lib/password"
import { normalizeEmail, validatePassword } from "@/lib/password-rules"
import { checkRateLimit, getClientIp, recordFailedAttempt, resetAttempts, retryMessage } from "@/lib/rate-limit"
import { decoyQuestion, normalizeAnswer } from "@/lib/security-questions"

const WRONG = "That answer is not correct."
const LOOKUPS_PER_WINDOW = 20

/** The tail of the password hash. Baked into the reset token so it can be used only once. */
const hashTail = (hash: string) => hash.slice(-16)

/**
 * Forgot password, in three public steps:
 *   question: {email}               -> {question}      (a stand-in question if the email is unknown)
 *   verify:   {email, answer}       -> {verified, resetToken}
 *   reset:    {resetToken, newPassword} -> {success}
 */
export async function POST(request: Request) {
  try {
    const b = await readJson(request)
    const ip = getClientIp(request)

    if (b.step === "question") {
      const email = normalizeEmail(b.email)
      const key = `reset-question:${ip}`
      const limit = await checkRateLimit(key, LOOKUPS_PER_WINDOW)
      if (!limit.allowed) return NextResponse.json({ error: retryMessage(limit.retryAfter ?? 900), retryAfter: limit.retryAfter }, { status: 429 })
      await recordFailedAttempt(key) // every lookup counts, so the question cannot be used to scan for emails
      const user = email ? await db.user.findUnique({ where: { email }, select: { securityQuestion: true, isActive: true } }) : null
      const question = user?.isActive && user.securityQuestion ? user.securityQuestion : decoyQuestion(email)
      return NextResponse.json({ question })
    }

    if (b.step === "verify") {
      const email = normalizeEmail(b.email)
      const answer = typeof b.answer === "string" ? normalizeAnswer(b.answer) : ""
      const ipKey = `reset:ip:${ip}`
      const emailKey = `reset:email:${email}`
      const [byIp, byEmail] = await Promise.all([checkRateLimit(ipKey), checkRateLimit(emailKey)])
      if (!byIp.allowed || !byEmail.allowed) {
        const retryAfter = Math.max(byIp.retryAfter ?? 0, byEmail.retryAfter ?? 0)
        return NextResponse.json({ error: retryMessage(retryAfter), retryAfter }, { status: 429 })
      }

      const user = email ? await db.user.findUnique({ where: { email } }) : null
      const usable = !!user && user.isActive && !!user.securityAnswer && !!answer
      const ok = usable ? await comparePassword(answer, user.securityAnswer) : await compareAgainstDummy(answer)
      if (!usable || !ok) {
        await Promise.all([recordFailedAttempt(ipKey), recordFailedAttempt(emailKey)])
        return NextResponse.json({ error: WRONG }, { status: 401 })
      }
      await Promise.all([resetAttempts(ipKey), resetAttempts(emailKey)])
      const resetToken = await signResetToken({ userId: user.id, email: user.email, pv: hashTail(user.passwordHash) })
      return NextResponse.json({ verified: true, resetToken })
    }

    if (b.step === "reset") {
      const claims = typeof b.resetToken === "string" ? await verifyResetToken(b.resetToken) : null
      const problem = validatePassword(b.newPassword)
      if (problem) throw new BadRequestError(problem)
      const user = claims ? await db.user.findUnique({ where: { id: claims.userId } }) : null
      // the tail check makes the token single-use: changing the password changes the hash it was issued against
      if (!claims || !user || !user.isActive || hashTail(user.passwordHash) !== claims.pv) {
        return NextResponse.json({ error: "This reset link has expired. Start again." }, { status: 401 })
      }
      await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(b.newPassword as string) } })
      await logSessionEvent(user.id, "password_reset", request)
      return NextResponse.json({ success: true })
    }

    throw new BadRequestError("Unknown step.")
  } catch (error) {
    return handleError(error, "auth/reset-password")
  }
}
