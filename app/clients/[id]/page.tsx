import {
  Building2,
  ExternalLink,
  FileText,
  Globe,
  History as HistoryIcon,
  LayoutGrid,
  ListChecks,
  MapPin,
  MessageCircle,
  Palette,
  Pencil,
  Phone,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { EmptyState } from "@/components/empty-state"
import { ClientDetailSkeleton } from "@/components/skeletons"
import { ClientAvatar } from "@/components/client-avatar"
import { ActivityTimeline } from "@/components/clients/activity-timeline"
import { OnboardingChecklist } from "@/components/clients/onboarding-checklist"
import { QuickNotes } from "@/components/clients/quick-notes"
import { MessageBuilder } from "@/components/clients/message-builder"
import { CopyButton } from "@/components/copy-button"
import { DeleteClientDialog } from "@/components/delete-client-dialog"
import { DisconnectGbpButton } from "@/components/gbp/disconnect-button"
import { HistoryItem } from "@/components/history-item"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, Eyebrow } from "@/components/ui/card"
import { getSession } from "@/lib/auth"
import { displayDomain, formatPhone, normalizeUaeNumber } from "@/lib/client-schema"
import { getClient, getClientContentStats, listClientContent, type ClientDetail } from "@/lib/clients"
import { CONTENT_TYPES, INITIAL_SETUP_OPTIONS } from "@/lib/constants"
import { ensureChecklist } from "@/lib/onboarding-checklist"
import { getConnectionSummary } from "@/lib/gbp-api"
import { formatDate, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Client Details" }

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

export default function ClientPage(props: PageProps<"/clients/[id]">) {
  return (
    <Suspense fallback={<ClientDetailSkeleton />}>
      <ClientDetailContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  )
}

async function ClientDetailContent({
  params,
  searchParams,
}: {
  params: PageProps<"/clients/[id]">["params"]
  searchParams: PageProps<"/clients/[id]">["searchParams"]
}) {
  await connection()
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const [client, stats, session] = await Promise.all([getClient(id), getClientContentStats(id), getSession()])
  if (!client) notFound()
  const canDelete = session?.role === "super_admin"

  const tabParam = first(sp.tab)
  const tab = (["history", "activity", "onboarding", "settings"] as const).find((t) => t === tabParam) ?? "overview"
  const now = new Date()

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-5">
          <ClientAvatar id={client.id} name={client.name} color={client.primaryColor} className="size-16 rounded-xl text-xl" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
              <span dir="rtl" lang="ar" className="text-muted-foreground">
                {client.nameAr}
              </span>
              <Badge variant="success">Active</Badge>
              <Badge variant="muted">{client.emirate}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Client ID: <span className="font-mono text-foreground">{client.slug}</span> · Added {formatDate(client.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {client.website && (
              <a href={client.website} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}>
                <ExternalLink /> Visit Website
              </a>
            )}
            <Link href={`/clients/${client.id}/edit`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Pencil /> Edit Client
            </Link>
            {canDelete && (
              <DeleteClientDialog
                clientId={client.id}
                clientName={client.name}
                contentCount={stats.total}
                redirectTo="/clients"
                trigger={
                  <Button variant="destructive" size="lg">
                    <Trash2 /> Delete
                  </Button>
                }
              />
            )}
          </div>
        </div>
      </Card>

      <nav aria-label="Client sections" className="flex gap-1 border-b border-border">
        <TabLink href={`/clients/${client.id}`} active={tab === "overview"} icon={<LayoutGrid />}>
          Overview
        </TabLink>
        <TabLink href={`/clients/${client.id}?tab=history`} active={tab === "history"} icon={<FileText />} count={stats.total}>
          Content History
        </TabLink>
        <TabLink href={`/clients/${client.id}?tab=activity`} active={tab === "activity"} icon={<HistoryIcon />}>
          Activity
        </TabLink>
        <TabLink
          href={`/clients/${client.id}?tab=onboarding`}
          active={tab === "onboarding"}
          icon={<ListChecks />}
          count={client.checklist.total ? `${client.checklist.done}/${client.checklist.total}` : undefined}
        >
          Onboarding
        </TabLink>
        <TabLink href={`/clients/${client.id}?tab=settings`} active={tab === "settings"} icon={<Settings />}>
          Settings
        </TabLink>
      </nav>

      {tab === "overview" ? (
        <Overview client={client} stats={stats} now={now} />
      ) : tab === "activity" ? (
        <ActivityTimeline clientId={client.id} />
      ) : tab === "onboarding" ? (
        <OnboardingSection clientId={client.id} />
      ) : tab === "settings" ? (
        <GbpSection clientId={client.id} result={first(sp.gbp)} message={first(sp.message)} />
      ) : (
        <History clientId={client.id} total={stats.total} type={first(sp.type)} q={first(sp.q)} now={now} />
      )}

      {/* outside the tab switch, so the notes stay one click away on every tab */}
      <QuickNotes key={client.id} clientId={client.id} initialNotes={client.quickNotes} />
    </div>
  )
}

function TabLink({
  href,
  active,
  icon,
  count,
  children,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  count?: number | string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors [&_svg]:size-4",
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {children}
      {count !== undefined && <Badge variant="muted">{count}</Badge>}
    </Link>
  )
}

/* ---------------------------------------------------------------- overview */

function Overview({
  client,
  stats,
  now,
}: {
  client: ClientDetail
  stats: Awaited<ReturnType<typeof getClientContentStats>>
  now: Date
}) {
  const whatsappDigits = `971${normalizeUaeNumber(client.whatsapp)}`
  const queued = INITIAL_SETUP_OPTIONS.filter((o) => client.initialSetup.includes(o.value))

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5">
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle>
              <Building2 className="size-4 text-muted-foreground" /> Client Information
            </CardTitle>
            <Eyebrow>Profile master</Eyebrow>
          </CardHeader>
          <CardContent className="space-y-6 pt-5">
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <Info label="English trading name">{client.name}</Info>
              <Info label="Arabic official name">
                <span dir="rtl" lang="ar">
                  {client.nameAr}
                </span>
              </Info>
              <Info label="Primary operating emirate">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 text-muted-foreground" /> {client.emirate}
                </span>
              </Info>
              <Info label="Direct phone">
                <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 font-mono hover:text-primary">
                  <Phone className="size-4 text-muted-foreground" /> {formatPhone(client.phone)}
                </a>
              </Info>
              <Info label="Primary website">
                {client.website ? (
                  <a
                    href={client.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <Globe className="size-4" /> {displayDomain(client.website)}
                  </a>
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </Info>
              <Info label="Direct WhatsApp">
                <a
                  href={`https://wa.me/${whatsappDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono hover:text-primary"
                >
                  <MessageCircle className="size-4 text-primary" /> {formatPhone(client.whatsapp)}
                </a>
              </Info>
            </dl>

            <Chips label="Other emirates served" items={client.emiratesServed} empty="Only serves its home emirate." />
            <Chips label="Areas served" items={client.areas} empty="No areas added yet." />
            <Chips label="Registered services" items={client.services} tone="primary" empty="No services selected." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle>
              <Palette className="size-4 text-muted-foreground" /> Brand Specifications
            </CardTitle>
            <Eyebrow>Guidelines</Eyebrow>
          </CardHeader>
          <CardContent className="space-y-6 pt-5">
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Eyebrow>Brand color palette</Eyebrow>
                <div className="flex flex-wrap gap-2">
                  {[
                    { name: "Primary", hex: client.primaryColor },
                    { name: "Secondary", hex: client.secondaryColor },
                  ]
                    .filter((c) => c.hex)
                    .map((c) => (
                      <div key={c.name} className="flex items-center gap-2.5 rounded-lg bg-muted/60 py-2 pr-4 pl-2">
                        <span className="size-8 rounded-md ring-1 ring-foreground/15" style={{ backgroundColor: c.hex! }} />
                        <span className="leading-tight">
                          <span className="block text-sm font-medium">{c.name}</span>
                          <span className="block font-mono text-xs text-muted-foreground uppercase">{c.hex}</span>
                        </span>
                      </div>
                    ))}
                </div>
              </div>
              <div className="space-y-2">
                <Eyebrow>Tone of voice</Eyebrow>
                {client.tones.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {client.tones.map((t) => (
                      <Badge key={t} variant="muted" className="px-2.5 py-1 text-sm">
                        {t}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Not set</p>
                )}
              </div>
              <Info label="Fleet / truck type">{client.truckType || <span className="text-muted-foreground">Not set</span>}</Info>
              <Info label="Staff uniform">{client.uniform || <span className="text-muted-foreground">Not set</span>}</Info>
            </div>

            <div className="space-y-2 border-t border-border pt-5">
              <div className="flex items-center justify-between">
                <Eyebrow>Internal operating notes</Eyebrow>
                <Link href={`/clients/${client.id}/edit`} className="text-sm text-primary hover:underline">
                  Update
                </Link>
              </div>
              <p className="rounded-lg bg-muted/60 p-4 text-sm whitespace-pre-wrap">
                {client.notes || <span className="text-muted-foreground">No notes yet.</span>}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle>
              <MessageCircle className="size-4 text-primary" /> Client Message
            </CardTitle>
            <Eyebrow>WhatsApp</Eyebrow>
          </CardHeader>
          <CardContent className="pt-4">
            <MessageBuilder
              clientName={client.name}
              whatsapp={whatsappDigits}
              website={client.website}
              facebookUrl={client.facebookUrl}
              instagramUrl={client.instagramUrl}
              driveLink={client.driveLink}
              otherLinks={client.otherLinks}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle>
              <Sparkles className="size-4 text-muted-foreground" /> Content Production
            </CardTitle>
            <Eyebrow>Total: {stats.total}</Eyebrow>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(CONTENT_TYPES).map(([type, meta]) => (
                <div key={type} className="rounded-lg bg-muted/60 p-3">
                  <p className="truncate text-xs text-muted-foreground">{meta.label}</p>
                  <p className="text-2xl font-semibold tabular-nums">{stats.byType[type] ?? 0}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Link href="/content" className={cn(buttonVariants({ size: "lg" }), "flex-1")}>
                <Zap /> Generate Content
              </Link>
              <Link href="/seo" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Run Audit
              </Link>
            </div>
            {queued.length > 0 && (
              <div className="space-y-1.5 border-t border-border pt-4">
                <Eyebrow>Queued for initial setup</Eyebrow>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {queued.map((o) => (
                    <li key={o.value}>· {o.label}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle>
              <Zap className="size-4 text-muted-foreground" /> Recent Activity
            </CardTitle>
            <Eyebrow>Last {Math.min(5, stats.total)} generated</Eyebrow>
          </CardHeader>
          <CardContent className="pt-2">
            {stats.recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing generated for this client yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {stats.recent.map((item) => (
                  <li key={item.id} className="space-y-1.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="muted">{CONTENT_TYPES[item.type]?.label ?? item.type}</Badge>
                      <span className="text-xs text-muted-foreground">{timeAgo(item.createdAt, now)}</span>
                    </div>
                    <p dir="auto" className="line-clamp-2 text-sm text-muted-foreground">
                      {item.content}
                    </p>
                    <div className="flex gap-2">
                      <CopyButton text={item.content} />
                      <Link href={`/clients/${client.id}?tab=history&type=${item.type}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        View all
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {stats.total > stats.recent.length && (
              <Link href={`/clients/${client.id}?tab=history`} className="block border-t border-border pt-3 text-center text-sm text-primary hover:underline">
                View all {stats.total} items in Content History →
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt>
        <Eyebrow>{label}</Eyebrow>
      </dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}

function Chips({ label, items, tone, empty }: { label: string; items: string[]; tone?: "primary"; empty: string }) {
  return (
    <div className="space-y-2 border-t border-border pt-5">
      <Eyebrow>{label}</Eyebrow>
      {items.length ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item}>
              <Badge variant={tone === "primary" ? "default" : "muted"} className="rounded-lg px-3 py-1.5 text-sm">
                {item}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- onboarding */

async function OnboardingSection({ clientId }: { clientId: string }) {
  // clients created before the checklist existed get their default list the first time it is opened
  const items = await ensureChecklist(clientId)
  if (!items) notFound()
  return <OnboardingChecklist clientId={clientId} initialItems={items} />
}

/* ---------------------------------------------------------------- settings */

async function GbpSection({ clientId, result, message }: { clientId: string; result: string; message: string }) {
  const gbp = await getConnectionSummary(clientId)

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle>
          <MapPin className="size-4 text-muted-foreground" /> Google Business Profile
        </CardTitle>
        <Eyebrow>{gbp.connected ? "Connected" : "Not connected"}</Eyebrow>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {result === "connected" && <p role="status" className="rounded-lg bg-emerald-600/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">Google Business Profile connected.</p>}
        {result === "error" && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {message || "Couldn't connect Google Business Profile. Please try again."}
          </p>
        )}

        {gbp.connected ? (
          <>
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <Info label="Location">{gbp.locationName || <span className="text-muted-foreground">Unnamed location</span>}</Info>
              <Info label="Connected on">{formatDate(gbp.connectedAt)}</Info>
            </dl>
            <p className="text-sm text-muted-foreground">Posts can be published from the GBP Posts calendar with Publish Now.</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/gbp-posts" className={buttonVariants({ size: "lg" })}>
                Open GBP Posts
              </Link>
              <DisconnectGbpButton clientId={clientId} />
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Connect this client&apos;s listing to publish approved posts straight to Google. Sign in with the Google account that manages the Business Profile.
            </p>
            {/* a plain link: the route sets the security cookie and redirects to Google */}
            <a href={`/api/gbp-connect?clientId=${encodeURIComponent(clientId)}&redirect=1`} className={buttonVariants({ size: "lg" })}>
              <MapPin /> Connect GBP
            </a>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/* ----------------------------------------------------------------- history */

async function History({ clientId, total, type, q, now }: { clientId: string; total: number; type: string; q: string; now: Date }) {
  const items = await listClientContent(clientId, { type: type in CONTENT_TYPES ? type : undefined, q })
  const base = `/clients/${clientId}?tab=history`
  const withType = (t: string) => (t ? `${base}&type=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}` : `${base}${q ? `&q=${encodeURIComponent(q)}` : ""}`)

  return (
    <Card>
      <CardHeader className="flex-wrap border-b border-border pb-4">
        <div className="flex flex-wrap gap-1.5">
          {[["", "All"], ...Object.entries(CONTENT_TYPES).map(([k, v]) => [k, v.label])].map(([key, label]) => (
            <Link
              key={key || "all"}
              href={withType(key)}
              aria-current={type === key || (!type && key === "") ? "true" : undefined}
              className={cn(
                "rounded-lg px-2.5 py-1 text-sm transition-colors",
                (type || "") === key ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
        <form action={`/clients/${clientId}`} className="relative w-64 max-w-full">
          <input type="hidden" name="tab" value="history" />
          {type && <input type="hidden" name="type" value={type} />}
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search content…"
            aria-label="Search content history"
            className="h-9 w-full rounded-lg bg-muted pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </form>
      </CardHeader>
      <CardContent className="pt-2">
        {items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={total === 0 ? "No content generated yet" : "No content matches your filters"}
            description={total === 0 ? "Generate content for this client from the Content module. Everything you generate is saved here: descriptions, FAQs, blog posts, ads and reports." : "Try another type or search term."}
            className="border-0 bg-transparent py-14"
          >
            {total === 0 && (
              <Link href="/content" className={buttonVariants()}>
                Generate content
              </Link>
            )}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <HistoryItem
                key={item.id}
                now={now}
                row={{
                  id: item.id,
                  type: item.type,
                  subtype: item.subtype,
                  language: item.language,
                  content: item.content,
                  contentAr: item.contentAr,
                  humanized: item.humanized,
                  createdAt: item.createdAt,
                  edited: Boolean(item.metadata && typeof item.metadata === "object" && "edited" in item.metadata),
                }}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
