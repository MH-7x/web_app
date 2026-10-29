"use client"

import { Loader2, LogOut, Settings } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { goTo } from "@/components/auth/auth-api"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { roleLabel } from "@/lib/roles"

export type MenuUser = { name: string; email: string; role: string }

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?"

/** The avatar in the top bar: who is signed in, a way to Settings, and Logout. */
export function UserMenu({ user }: { user: MenuUser }) {
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)

  async function logout() {
    setLeaving(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } finally {
      // even if the request failed, leave: proxy.ts sends a signed-out visitor to /login anyway
      goTo("/login")
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Account menu for ${user.name}`}
        className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {initials(user.name)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        <div className="space-y-1 px-2.5 py-2">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <Badge variant={user.role === "super_admin" ? "default" : "muted"} className="mt-1">
            {roleLabel(user.role)}
          </Badge>
        </div>
        <div className="my-1 h-px bg-border" role="separator" />
        <Link href="/settings" onClick={() => setOpen(false)} className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm hover:bg-muted">
          <Settings className="size-4" /> Settings
        </Link>
        <button type="button" onClick={logout} disabled={leaving} className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm hover:bg-muted disabled:opacity-60">
          {leaving ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />} Logout
        </button>
      </PopoverContent>
    </Popover>
  )
}
