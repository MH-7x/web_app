import { db } from "@/lib/db"

const DAY = 24 * 60 * 60 * 1000
const TZ = "Asia/Dubai"

/** Start of the given calendar day in Dubai (UTC+4, no DST). */
function dubaiDayStart(date: Date) {
  const shifted = new Date(date.getTime() + 4 * 60 * 60 * 1000)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - 4 * 60 * 60 * 1000)
}

export function dubaiHour(date: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TZ }).format(date)) % 24
}

export function greeting(date: Date) {
  const h = dubaiHour(date)
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

export function longDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(date)
}

export async function getDashboardData(now: Date) {
  const todayStart = dubaiDayStart(now)
  const monthParts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: TZ }).format(now).split("-")
  const year = Number(monthParts[0])
  const month = Number(monthParts[1])
  const monthStart = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+04:00`)
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const prevMonthStart = new Date(`${prevYear}-${String(prevMonth).padStart(2, "0")}-01T00:00:00+04:00`)
  const weekStart = new Date(todayStart.getTime() - 6 * DAY)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY)

  const [clients, thisMonth, lastMonth, total, idle, weekRows, topGroup, recentClients] = await Promise.all([
    db.client.count(),
    db.generatedContent.count({ where: { createdAt: { gte: monthStart } } }),
    db.generatedContent.count({ where: { createdAt: { gte: prevMonthStart, lt: monthStart } } }),
    db.generatedContent.count(),
    db.client.count({ where: { content: { none: { createdAt: { gte: thirtyDaysAgo } } } } }),
    db.generatedContent.findMany({ where: { createdAt: { gte: weekStart } }, select: { createdAt: true } }),
    db.generatedContent.groupBy({
      by: ["clientId"],
      where: { createdAt: { gte: monthStart } },
      _count: { _all: true },
      orderBy: { _count: { clientId: "desc" } },
      take: 1,
    }),
    db.client.findMany({ orderBy: { createdAt: "desc" }, take: 4, select: { id: true, name: true, emirate: true, createdAt: true } }),
  ])

  const topClient = topGroup[0]
    ? {
        count: topGroup[0]._count._all,
        client: await db.client.findUnique({ where: { id: topGroup[0].clientId }, select: { id: true, name: true, emirate: true } }),
      }
    : null

  const week = Array.from({ length: 7 }, (_, i) => {
    const start = new Date(weekStart.getTime() + i * DAY)
    const count = weekRows.filter((r) => r.createdAt >= start && r.createdAt < new Date(start.getTime() + DAY)).length
    const label = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: TZ }).format(new Date(start.getTime() + 12 * 60 * 60 * 1000))
    return { label, count }
  })

  return { clients, thisMonth, lastMonth, total, idle, week, topClient, recentClients }
}
