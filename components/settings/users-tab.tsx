"use client"

import { Loader2, Pencil, Plus, UserCheck, UserX } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { ErrorNote } from "@/components/content/parts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Input, Label } from "@/components/ui/input"
import { validateEmail, validateName, validatePassword } from "@/lib/password-rules"
import { roleLabel } from "@/lib/roles"

type UserRow = { id: string; name: string; email: string; role: string; isActive: boolean; createdAt: string; lastLogin: string | null }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never")
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = (await res.json().catch(() => ({}))) as { error?: string; user?: UserRow; users?: UserRow[] }
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`)
  return data
}

/** Super admin only. The API enforces that too; this tab is simply not offered to anyone else. */
export function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<UserRow | "new" | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(
    () =>
      api("/api/settings/users", "GET").then(
        (data) => {
          setError(null)
          setUsers(data.users ?? [])
        },
        (e) => setError(e instanceof Error ? e.message : "Could not load users.")
      ),
    []
  )

  useEffect(() => {
    // state is only set once the request settles, never synchronously in the effect
    void load()
  }, [load])

  async function setActive(user: UserRow, isActive: boolean) {
    setBusyId(user.id)
    try {
      await (isActive ? api(`/api/settings/users/${user.id}`, "PUT", { isActive: true }) : api(`/api/settings/users/${user.id}`, "DELETE"))
      toast.success(isActive ? "User reactivated" : "User deactivated", { description: user.name })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.")
    }
    setBusyId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">Everyone who can sign in to the dashboard. Deactivated users are blocked straight away but their history is kept.</p>
        </div>
        <Button size="lg" onClick={() => setEditing("new")}>
          <Plus /> Add User
        </Button>
      </div>

      {error && <ErrorNote message={error} onRetry={load} />}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/60 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Last login</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users === null && !error && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </td>
                </tr>
              )}
              {users?.map((u) => (
                <tr key={u.id} className={u.isActive ? undefined : "text-muted-foreground"}>
                  <td className="px-4 py-3 font-medium">
                    {u.name} {u.id === currentUserId && <span className="font-normal text-muted-foreground">(you)</span>}
                  </td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={u.role === "super_admin" ? "default" : "muted"}>{roleLabel(u.role)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={u.isActive ? "success" : "destructive"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{day(u.createdAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{when(u.lastLogin)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${u.name}`} onClick={() => setEditing(u)}>
                        <Pencil />
                      </Button>
                      {u.id !== currentUserId &&
                        (u.isActive ? (
                          <Button variant="ghost" size="icon-sm" aria-label={`Deactivate ${u.name}`} className="hover:text-destructive" disabled={busyId === u.id} onClick={() => setActive(u, false)}>
                            {busyId === u.id ? <Loader2 className="animate-spin" /> : <UserX />}
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon-sm" aria-label={`Reactivate ${u.name}`} disabled={busyId === u.id} onClick={() => setActive(u, true)}>
                            {busyId === u.id ? <Loader2 className="animate-spin" /> : <UserCheck />}
                          </Button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <UserDialog
          // remounting per target resets the form state
          key={editing === "new" ? "new" : editing.id}
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function UserDialog({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    const problem = validateName(name.trim()) ?? validateEmail(email.trim().toLowerCase()) ?? (user && !password ? null : validatePassword(password))
    if (problem) return setError(problem)
    setSaving(true)
    setError(null)
    try {
      if (user) {
        await api(`/api/settings/users/${user.id}`, "PUT", { name, email, ...(password ? { password } : {}) })
        toast.success("User updated", { description: name.trim() })
      } else {
        await api("/api/settings/users", "POST", { name, email, password })
        toast.success("User added", { description: name.trim() })
      }
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{user ? "Edit user" : "Add user"}</DialogTitle>
        <DialogDescription>{user ? "Leave the password empty to keep the current one." : "They can sign in with this email and password straight away."}</DialogDescription>
        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="u-name">Name</Label>
            <Input id="u-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-email">Email</Label>
            <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-password">{user ? "New password" : "Password"}</Label>
            <Input id="u-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-muted-foreground">At least 8 characters with an uppercase letter, a lowercase letter and a number.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <p className="text-sm text-muted-foreground">{user ? roleLabel(user.role) : "Admin"} — can use everything except user management and deleting clients.</p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} {user ? "Save changes" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
