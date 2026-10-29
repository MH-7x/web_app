import { NextResponse } from "next/server"

import { getSession, logSessionEvent } from "@/lib/auth"
import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { hashPassword } from "@/lib/password"
import { normalizeEmail, validateEmail, validateName, validatePassword } from "@/lib/password-rules"

const userSelect = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } as const

type Ctx = { params: Promise<{ id: string }> }

export async function PUT(request: Request, { params }: Ctx) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const { id } = await params
    const target = await db.user.findUnique({ where: { id }, select: { id: true } })
    if (!target) return fail("User not found.", 404)

    const b = await readJson(request)
    const data: { name?: string; email?: string; isActive?: boolean; passwordHash?: string } = {}

    if (b.name !== undefined) {
      const name = typeof b.name === "string" ? b.name.trim() : ""
      const problem = validateName(name)
      if (problem) throw new BadRequestError(problem)
      data.name = name
    }
    if (b.email !== undefined) {
      const email = normalizeEmail(b.email)
      const problem = validateEmail(email)
      if (problem) throw new BadRequestError(problem)
      const taken = await db.user.findUnique({ where: { email }, select: { id: true } })
      if (taken && taken.id !== id) return fail("A user with that email already exists.", 409)
      data.email = email
    }
    if (b.isActive !== undefined) {
      if (typeof b.isActive !== "boolean") throw new BadRequestError("isActive must be true or false.")
      if (!b.isActive && id === session.userId) throw new BadRequestError("You can't deactivate your own account.")
      data.isActive = b.isActive
    }
    if (typeof b.password === "string" && b.password !== "") {
      const problem = validatePassword(b.password)
      if (problem) throw new BadRequestError(problem)
      data.passwordHash = await hashPassword(b.password)
    }
    if (Object.keys(data).length === 0) throw new BadRequestError("Nothing to update.")

    const user = await db.user.update({ where: { id }, data, select: userSelect })
    if (data.passwordHash) await logSessionEvent(id, "password_reset", request)
    return NextResponse.json({ user })
  } catch (error) {
    return handleError(error, "settings/users/[id]")
  }
}

/** Soft delete: the account is switched off, not removed, so its session history stays readable. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const { id } = await params
    if (id === session.userId) throw new BadRequestError("You can't deactivate your own account.")
    const target = await db.user.findUnique({ where: { id }, select: { id: true } })
    if (!target) return fail("User not found.", 404)
    await db.user.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleError(error, "settings/users/[id]")
  }
}
