"use client"

import {
  BarChart3,
  CalendarDays,
  KeyRound,
  FileText,
  LayoutDashboard,
  Link2,
  Megaphone,
  MessageCircle,
  Search,
  Settings,
  Users,
  Wand2,
  Box,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/ads", label: "Facebook Ads", icon: Megaphone },
  { href: "/gbp-posts", label: "GBP Posts", icon: CalendarDays },
  { href: "/reviews", label: "Reviews", icon: MessageCircle },
  { href: "/seo", label: "SEO Audit", icon: Search },
  { href: "/citations", label: "Citations", icon: Link2 },
  { href: "/keywords", label: "Keywords", icon: KeyRound },
  { href: "/humanizer", label: "Humanizer", icon: Wand2 },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/proposals", label: "Proposals", icon: FileText },
] as const

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Users; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  )
}

/** usePathname() is runtime data, so the live sidebar streams in behind this static one. */
export function Sidebar() {
  return <SidebarView pathname={usePathname()} />
}

export function SidebarFallback() {
  return <SidebarView pathname="" />
}

function SidebarView({ pathname }: { pathname: string }) {
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`))

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[200px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <Link href="/" className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
        <span className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <Box className="size-4" />
        </span>
        <span className="leading-tight">
          <span className="block text-[13px] font-semibold">UAE Marketing</span>
          <span className="block text-[10px] font-medium tracking-wider text-muted-foreground uppercase">Hub · Movers</span>
        </span>
      </Link>

      <nav aria-label="Main navigation" className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <NavLink href="/settings" label="Settings" icon={Settings} active={isActive("/settings")} />
      </div>
    </aside>
  )
}
