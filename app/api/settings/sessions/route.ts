import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { db } from "@/lib/db"
import { handleError } from "@/lib/gbp-posts-api"

const ACTIONS = ["login", "logout", "failed_login", "password_reset"]

/** A YYYY-MM-DD from the filter, as a UTC bound. `end` includes that whole day. */
function dayBound(value: string | null, end: boolean) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return undefined
  if (end) date.setUTCDate(date.getUTCDate() + 1)
  return date
}

/**
 * Sign-in history, newest first. The super admin sees everyone's and can filter by ?userId=; an admin only ever sees
 * their own, whatever they ask for. Also ?action=, ?from= / ?to= (YYYY-MM-DD), ?limit= (max 200) and ?offset=.
 */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const params = new URL(request.url).searchParams
    const isSuper = session.role === "super_admin"
    const userId = isSuper ? params.get("userId") || undefined : session.userId
    const action = params.get("action")
    const from = dayBound(params.get("from"), false)
    const to = dayBound(params.get("to"), true)
    const limit = Math.min(200, Math.max(1, Number.parseInt(params.get("limit") ?? "50", 10) || 50))
    const offset = Math.max(0, Number.parseInt(params.get("offset") ?? "0", 10) || 0)

    const where = {
      ...(userId ? { userId } : {}),
      ...(action && ACTIONS.includes(action) ? { action } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    }
    const [rows, total, users] = await Promise.all([
      db.sessionLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      db.sessionLog.count({ where }),
      isSuper ? db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    ])
    const names = new Map(
      (isSuper ? users : await db.user.findMany({ where: { id: session.userId }, select: { id: true, name: true } })).map((u) => [u.id, u.name])
    )
    return NextResponse.json({
      logs: rows.map((r) => ({ id: r.id, userId: r.userId, userName: names.get(r.userId) ?? "Unknown user", action: r.action, ip: r.ip, userAgent: r.userAgent, createdAt: r.createdAt })),
      total,
      users, // the filter dropdown; empty for an admin, who has nothing to filter by
    })
  } catch (error) {
    return handleError(error, "settings/sessions")
  }
}
