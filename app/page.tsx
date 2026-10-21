import {
  Activity,
  ArrowRight,
  Building2,
  CalendarDays,
  FileText,
  Megaphone,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UserX,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"

import { DashboardSkeleton } from "@/components/skeletons"
import { ClientAvatar } from "@/components/client-avatar"
import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, Eyebrow } from "@/components/ui/card"
import { getRecentActivity } from "@/lib/activity"
import { getDashboardData, greeting, longDate } from "@/lib/dashboard"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Dashboard" }

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  )
}

const QUICK_ACTIONS = [
  { href: "/clients/new", title: "New Client", hint: "Onboard a mover profile", icon: UserPlus },
  { href: "/gbp-posts", title: "Generate GBP Post", hint: "Localized CTA & offers", icon: CalendarDays },
  { href: "/ads", title: "Create Ad Campaign", hint: "Facebook & Instagram copy", icon: Megaphone },
  { href: "/seo", title: "Run SEO Audit", hint: "Local movers SERP check", icon: Search },
]

async function Dashboard() {
  await connection()
  const now = new Date()
  const [data, activity] = await Promise.all([getDashboardData(now), getRecentActivity(10)])
  const maxDay = Math.max(1, ...data.week.map((d) => d.count))
  const weekTotal = data.week.reduce((sum, d) => sum + d.count, 0)
  const peak = data.week.reduce((best, d) => (d.count > best.count ? d : best), data.week[0])
  const delta = data.lastMonth > 0 ? Math.round(((data.thisMonth - data.lastMonth) / data.lastMonth) * 100) : null

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Eyebrow className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" /> UAE operational hub · multi-client engine
          </Eyebrow>
          <h1 className="text-3xl font-semibold tracking-tight">{greeting(now)}, Mashal</h1>
        </div>
        <p className="flex h-8 items-center gap-2 rounded-lg bg-muted px-3 text-sm">
          <CalendarDays className="size-4 text-muted-foreground" /> {longDate(now)}
        </p>
      </header>

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active Clients" icon={<Building2 />} value={data.clients} unit="registered" badge="UAE market" />
        <Stat
          label="Content This Month"
          icon={<Sparkles />}
          value={data.thisMonth}
          unit="assets"
          trend={delta === null ? undefined : { delta, label: `${delta >= 0 ? "+" : ""}${delta}% m/m` }}
        />
        <Stat label="Total Generated" icon={<FileText />} value={data.total} unit="assets" badge="All time" />
        <Stat
          label="Idle Clients (30d)"
          icon={<UserX />}
          value={data.idle}
          unit={data.idle === 1 ? "client" : "clients"}
          badge={data.idle > 0 ? "Needs content" : "All active"}
          warn={data.idle > 0}
        />
      </section>

      <section aria-label="Quick actions" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Fast execution</Eyebrow>
          <Eyebrow>Jump straight in</Eyebrow>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_ACTIONS.map(({ href, title, hint, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:ring-primary/40"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block truncate text-xs text-muted-foreground">{hint}</span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <Eyebrow>Spotlight client</Eyebrow>
            {data.topClient && <Badge variant="success">Top this month</Badge>}
          </CardHeader>
          <CardContent>
            {data.topClient?.client ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <ClientAvatar id={data.topClient.client.id} name={data.topClient.client.name} className="size-11 rounded-xl" />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{data.topClient.client.name}</p>
                    <p className="text-sm text-muted-foreground">{data.topClient.client.emirate}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="text-2xl font-semibold text-foreground tabular-nums">{data.topClient.count}</span> assets generated this month.
                </p>
                <Link href={`/clients/${data.topClient.client.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  Open Workspace <ArrowRight className="size-4" />
                </Link>
              </div>
            ) : (
              <EmptyNote>No content generated this month yet.</EmptyNote>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <Eyebrow>Weekly output velocity</Eyebrow>
            <Eyebrow>Last 7 days</Eyebrow>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              <span className="text-3xl font-semibold tabular-nums">{weekTotal}</span>{" "}
              <span className="text-sm text-muted-foreground">{weekTotal === 1 ? "asset" : "assets"}</span>
            </p>
            <div
              role="img"
              aria-label={`Assets per day: ${data.week.map((d) => `${d.label} ${d.count}`).join(", ")}`}
              className="flex h-28 items-end gap-2 rounded-lg bg-muted/60 p-3"
            >
              {data.week.map((d) => (
                <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div
                    className={cn("w-full rounded-sm", d.count === maxDay && d.count > 0 ? "bg-primary dark:bg-chart-2" : "bg-chart-2/60")}
                    style={{ height: `${d.count === 0 ? 3 : Math.max(8, (d.count / maxDay) * 100)}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{d.label.slice(0, 1)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {weekTotal > 0 ? `Highest: ${peak.label} (${peak.count} ${peak.count === 1 ? "item" : "items"})` : "No output in the last 7 days."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <Eyebrow>Newest clients</Eyebrow>
            <Link href="/clients" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {data.recentClients.length ? (
              <ul className="divide-y divide-border">
                {data.recentClients.map((c) => (
                  <li key={c.id}>
                    <Link href={`/clients/${c.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                      <ClientAvatar id={c.id} name={c.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        <span className="block text-xs text-muted-foreground">{c.emirate}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt, now)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote>
                No clients yet.{" "}
                <Link href="/clients/new" className="text-primary hover:underline">
                  Add the first one
                </Link>
                .
              </EmptyNote>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-label="Recent activity" className="space-y-3">
        <div className="flex items-center gap-2">
          <Eyebrow>Recent activity</Eyebrow>
          <Badge variant="muted">Last {activity.length} {activity.length === 1 ? "item" : "items"} · all clients</Badge>
        </div>
        {activity.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Nothing generated yet"
            description="Content, GBP posts and audits you create for any client will show up here, newest first."
          >
            <Link href={data.clients === 0 ? "/clients/new" : "/content"} className={buttonVariants()}>
              {data.clients === 0 ? "Add your first client" : "Generate content"}
            </Link>
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            {activity.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
                    {item.kind === "audit" ? <Search /> : item.kind === "gbp-posts" ? <CalendarDays /> : <FileText />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium">{item.clientName}</span>
                      <Badge variant="muted">{item.label}</Badge>
                    </span>
                    <span dir="auto" className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {item.summary}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">{timeAgo(item.createdAt, now)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({
  label,
  icon,
  value,
  unit,
  badge,
  trend,
  warn,
}: {
  label: string
  icon: React.ReactNode
  value: number
  unit: string
  badge?: string
  trend?: { delta: number; label: string }
  warn?: boolean
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground [&_svg]:size-4">
        {label}
        {icon}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p>
          <span className="text-3xl font-semibold tabular-nums">{value}</span> <span className="text-sm text-muted-foreground">{unit}</span>
        </p>
        {trend ? (
          <span className={cn("flex items-center gap-1 text-xs font-medium", trend.delta >= 0 ? "text-primary" : "text-destructive")}>
            {trend.delta >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {trend.label}
          </span>
        ) : (
          badge && <Badge variant={warn ? "destructive" : "muted"}>{badge}</Badge>
        )}
      </div>
    </Card>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}

