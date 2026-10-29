import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { hashPassword } from "@/lib/password"
import { normalizeEmail, validateEmail, validateName, validatePassword } from "@/lib/password-rules"

/** Everything the Users tab shows. Never the hashes. */
const userSelect ={ id: true, name: true, email: true, role: true, isActive: true, createdAt: true } as const

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const [users, logins] = await Promise.all([
      db.user.findMany({ select: userSelect, orderBy: { createdAt: "asc" } }),
      db.sessionLog.groupBy({ by: ["userId"], where: { action: "login" }, _max: { createdAt: true } }),
    ])
    const lastLogin = new Map(logins.map((l) => [l.userId, l._max.createdAt]))
    return NextResponse.json({ users: users.map((u) => ({ ...u, lastLogin: lastLogin.get(u.id) ?? null })) })
  } catch (error) {
    return handleError(error, "settings/users")
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const b = await readJson(request)
    const name = typeof b.name === "string" ? b.name.trim() : ""
    const email = normalizeEmail(b.email)
    const problem = validateName(name) ?? validateEmail(email) ?? validatePassword(b.password)
    if (problem) throw new BadRequestError(problem)
    if (await db.user.findUnique({ where: { email }, select: { id: true } })) return fail("A user with that email already exists.", 409)

    // new users are always plain admins: there is exactly one super admin, created by the setup wizard
    const user = await db.user.create({ data: { name, email, passwordHash: await hashPassword(b.password as string), role: "admin" }, select: userSelect })
    return NextResponse.json({ user: { ...user, lastLogin: null } }, { status: 201 })
  } catch (error) {
    return handleError(error, "settings/users")
  }
}
