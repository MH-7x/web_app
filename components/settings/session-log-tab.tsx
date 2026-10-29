"use client"

import { Loader2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { ErrorNote } from "@/components/content/parts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label, Select } from "@/components/ui/input"

type Log = { id: string; userId: string; userName: string; action: string; ip: string; userAgent: string; createdAt: string }
type Response = { logs: Log[]; total: number; users: { id: string; name: string }[]; error?: string }

const PAGE = 50
const ACTIONS: Record<string, { label: string; variant: "success" | "muted" | "destructive" | "outline" }> = {
  login: { label: "Login", variant: "success" },
  logout: { label: "Logout", variant: "muted" },
  failed_login: { label: "Failed login", variant: "destructive" },
  password_reset: { label: "Password reset", variant: "outline" },
}
// the badge palette has no yellow, so the reset badge gets a warning tint of its own
const RESET_TINT = "border-0 bg-amber-500/15 text-amber-700 dark:text-amber-400"

const stamp = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })

/** Who signed in, out, or failed to, and from where. The super admin sees everyone; an admin sees only their own. */
export function SessionLogTab({ canFilterUsers }: { canFilterUsers: boolean }) {
  const [userId, setUserId] = useState("")
  const [action, setAction] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState<{ key: string; logs: Log[]; total: number; error: string | null } | null>(null)
  const [users, setUsers] = useState<Response["users"]>([])
  const [moreBusy, setMoreBusy] = useState(false)
  const [retry, setRetry] = useState(0)

  // The first page is tied to the filters that produced it: while `page.key` is behind `key`, a request is in flight.
  const key = `${userId}|${action}|${from}|${to}|${retry}`
  const loading = page?.key !== key || moreBusy
  const logs = page?.logs ?? []
  const total = page?.total ?? 0
  const error = page?.error ?? null

  const fetchPage = useCallback(
    async (offset: number) => {
      const q = new URLSearchParams({ limit: String(PAGE), offset: String(offset) })
      if (userId) q.set("userId", userId)
      if (action) q.set("action", action)
      if (from) q.set("from", from)
      if (to) q.set("to", to)
      const res = await fetch(`/api/settings/sessions?${q}`, { cache: "no-store" })
      const data = (await res.json().catch(() => ({}))) as Partial<Response>
      if (!res.ok || !data.logs) throw new Error(data.error ?? `Request failed (${res.status}).`)
      return { logs: data.logs, total: data.total ?? 0, users: data.users ?? [] }
    },
    [userId, action, from, to]
  )

  useEffect(() => {
    let cancelled = false
    fetchPage(0).then(
      (data) => {
        if (cancelled) return
        setPage({ key, logs: data.logs, total: data.total, error: null })
        if (data.users.length) setUsers(data.users)
      },
      (e) => !cancelled && setPage({ key, logs: [], total: 0, error: e instanceof Error ? e.message : "Could not load the session log." })
    )
    return () => {
      cancelled = true
    }
  }, [fetchPage, key])

  async function loadMore() {
    if (!page) return
    setMoreBusy(true)
    try {
      const data = await fetchPage(page.logs.length)
      setPage({ ...page, logs: [...page.logs, ...data.logs], total: data.total })
    } catch (e) {
      setPage({ ...page, error: e instanceof Error ? e.message : "Could not load more." })
    }
    setMoreBusy(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Session log</h2>
        <p className="text-sm text-muted-foreground">{canFilterUsers ? "Every sign-in, sign-out and failed attempt." : "Your own sign-ins and sign-outs."}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {canFilterUsers && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sl-user">User</Label>
            <Select id="sl-user" value={userId} onChange={(e) => setUserId(e.target.value)} className="w-48">
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sl-action">Event</Label>
          <Select id="sl-action" value={action} onChange={(e) => setAction(e.target.value)} className="w-44">
            <option value="">All events</option>
            {Object.entries(ACTIONS).map(([value, a]) => (
              <option key={value} value={value}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sl-from">From</Label>
          <Input id="sl-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sl-to">To</Label>
          <Input id="sl-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        {(userId || action || from || to) && (
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              setUserId("")
              setAction("")
              setFrom("")
              setTo("")
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {error && <ErrorNote message={error} onRetry={() => setRetry((n) => n + 1)} />}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Date &amp; time</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">IP address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((l) => {
                const a = ACTIONS[l.action]
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-3 whitespace-nowrap">{stamp(l.createdAt)}</td>
                    <td className="px-4 py-3 font-medium">{l.userName}</td>
                    <td className="px-4 py-3">
                      <Badge variant={a?.variant ?? "outline"} className={l.action === "password_reset" ? RESET_TINT : undefined} title={l.userAgent || undefined}>
                        {a?.label ?? l.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{l.ip}</td>
                  </tr>
                )
              })}
              {!loading && !error && logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No events match.
                  </td>
                </tr>
              )}
              {loading && logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {logs.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {logs.length} of {total}
          </span>
          {logs.length < total && (
            <Button variant="outline" size="lg" disabled={loading} onClick={loadMore}>
              {moreBusy && <Loader2 className="animate-spin" />} Load more
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
