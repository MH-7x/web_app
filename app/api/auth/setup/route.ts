import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { BadRequestError } from "@/lib/content-types"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { hashPassword } from "@/lib/password"
import { normalizeEmail, validateEmail, validateName, validatePassword } from "@/lib/password-rules"
import { normalizeAnswer } from "@/lib/security-questions"

/** Is the first-run wizard still needed? Public: the login and setup pages ask this before anyone is signed in. */
export async function GET() {
  try {
    return NextResponse.json({ needed: (await db.user.count()) === 0 })
  } catch (error) {
    return handleError(error, "auth/setup")
  }
}

/** Create the super admin. Works exactly once: as soon as any user exists this is closed. */
export async function POST(request: Request) {
  try {
    if ((await db.user.count()) > 0) return fail("Setup already completed", 403)

    const b = await readJson(request)
    const name = typeof b.name === "string" ? b.name.trim() : ""
    const email = normalizeEmail(b.email)
    const question = typeof b.securityQuestion === "string" ? b.securityQuestion.trim() : ""
    const answer = typeof b.securityAnswer === "string" ? normalizeAnswer(b.securityAnswer) : ""

    const problem = validateName(name) ?? validateEmail(email) ?? validatePassword(b.password)
    if (problem) throw new BadRequestError(problem)
    if (question.length < 3 || question.length > 200) throw new BadRequestError("Choose or write a security question.")
    if (!answer || answer.length > 200) throw new BadRequestError("Enter an answer to the security question.")

    const [passwordHash, securityAnswer] = await Promise.all([hashPassword(b.password as string), hashPassword(answer)])
    // re-check right before writing so two simultaneous submissions cannot both become super admin
    if ((await db.user.count()) > 0) return fail("Setup already completed", 403)
    await db.user.create({ data: { name, email, passwordHash, role: "super_admin", securityQuestion: question, securityAnswer } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleError(error, "auth/setup")
  }
}
