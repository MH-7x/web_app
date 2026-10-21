import { ChevronLeft, ChevronRight, ExternalLink, Eye, Pencil, Plus, Trash2, Users } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"

import { ClientsSkeleton } from "@/components/skeletons"
import { ClientAvatar } from "@/components/client-avatar"
import { ClientsFilters } from "@/components/clients-filters"
import { DeleteClientDialog } from "@/components/delete-client-dialog"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { displayDomain } from "@/lib/client-schema"
import { getEmirateCounts, listClients } from "@/lib/clients"
import { PAGE_SIZE } from "@/lib/constants"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Clients" }

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

export default function ClientsPage(props: PageProps<"/clients">) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <Link href="/clients/new" className={buttonVariants({ size: "lg" })}>
          <Plus /> Add Client
        </Link>
      </div>
      <Suspense fallback={<ClientsSkeleton />}>
        <ClientsContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}

async function ClientsContent({ searchParams }: { searchParams: PageProps<"/clients">["searchParams"] }) {
  await connection()
  const sp = await searchParams
  const q = first(sp.q)
  const emirate = first(sp.emirate)
  const requested = Math.max(1, Number.parseInt(first(sp.page), 10) || 1)

  const emirateCounts = await getEmirateCounts()
  const { items, total } = await listClients({ q, emirate }, requested)
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(requested, pages)
  const now = new Date()

  const pageHref = (p: number) => {
    const next = new URLSearchParams()
    if (q) next.set("q", q)
    if (emirate) next.set("emirate", emirate)
    if (p > 1) next.set("page", String(p))
    return next.size ? `/clients?${next}` : "/clients"
  }

  const filtering = Boolean(q || emirate)

  return (
    <>
      <Suspense>
        <ClientsFilters emirateCounts={emirateCounts} />
      </Suspense>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/60 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Client name</th>
                <th className="px-4 py-3 text-right font-medium">اسم الشركة (عربي)</th>
                <th className="px-4 py-3 font-medium">Emirate</th>
                <th className="px-4 py-3 font-medium">Services</th>
                <th className="px-4 py-3 font-medium">Live domain</th>
                <th className="px-4 py-3 font-medium">Activity</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="group flex items-center gap-3">
                      <ClientAvatar id={c.id} name={c.name} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium group-hover:text-primary">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">ID: {c.slug}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right" dir="rtl" lang="ar">
                    {c.nameAr}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="muted" className="gap-1.5">
                      <span className="size-1.5 rounded-full bg-chart-3" />
                      {c.emirate}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.servicesCount}</td>
                  <td className="px-4 py-3">
                    {c.website ? (
                      <a
                        href={c.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-44 items-center gap-1 text-primary hover:underline"
                      >
                        <span className="truncate">{displayDomain(c.website)}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{timeAgo(c.lastActivity, now)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-0.5">
                      <Link
                        href={`/clients/${c.id}`}
                        aria-label={`View ${c.name}`}
                        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
                      >
                        <Eye />
                      </Link>
                      <Link
                        href={`/clients/${c.id}/edit`}
                        aria-label={`Edit ${c.name}`}
                        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
                      >
                        <Pencil />
                      </Link>
                      <DeleteClientDialog
                        clientId={c.id}
                        clientName={c.name}
                        contentCount={c.contentCount}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} className="hover:text-destructive">
                            <Trash2 />
                          </Button>
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {items.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <Users className="size-8 text-muted-foreground/60" />
            <p className="font-medium">{filtering ? "No clients match your filters" : "No clients yet"}</p>
            <p className="text-sm text-muted-foreground">
              {filtering ? "Try a different search or reset the filters." : "Add your first moving company to get started."}
            </p>
            {!filtering && (
              <Link href="/clients/new" className={cn(buttonVariants(), "mt-2")}>
                <Plus /> Add Client
              </Link>
            )}
          </div>
        )}

        <div className="flex items-center justify-between bg-muted/60 px-4 py-3 text-sm">
          <p>
            Showing {items.length} of {total} {total === 1 ? "client" : "clients"}
          </p>
          {pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center gap-1">
              <PageLink href={pageHref(page - 1)} disabled={page <= 1} label="Previous page">
                <ChevronLeft />
              </PageLink>
              <span className="px-2 text-muted-foreground tabular-nums">
                {page} / {pages}
              </span>
              <PageLink href={pageHref(page + 1)} disabled={page >= pages} label="Next page">
                <ChevronRight />
              </PageLink>
            </nav>
          )}
        </div>
      </div>
    </>
  )
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  const cls = cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), disabled && "pointer-events-none opacity-40")
  return disabled ? (
    <span aria-disabled className={cls}>
      {children}
    </span>
  ) : (
    <Link href={href} aria-label={label} className={cls}>
      {children}
    </Link>
  )
}

