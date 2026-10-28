"use client"

import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const LABELS: Record<string, string> = {
  clients: "Clients",
  new: "New",
  edit: "Edit",
  content: "Content",
  ads: "Facebook Ads",
  "gbp-posts": "GBP Posts",
  reviews: "Reviews",
  seo: "SEO Audit",
  citations: "Citations",
  keywords: "Keywords",
  humanizer: "Humanizer",
  reports: "Reports",
  proposals: "Proposals",
  settings: "Settings",
}

export function Breadcrumb() {
  const segments = usePathname().split("/").filter(Boolean)

  const crumbs: { label: string; href: string }[] = []
  segments.forEach((segment, i) => {
    const href = `/${segments.slice(0, i + 1).join("/")}`
    // /clients/<id> is an opaque id
    if (segments[0] === "clients" && i === 1 && segment !== "new") crumbs.push({ label: "Client Details", href })
    else if (segments[0] === "proposals" && i === 1 && segment !== "new") crumbs.push({ label: "Project", href })
    else if (segment === "new") crumbs.push({ label: segments[0] === "proposals" ? "New Project" : "Add Client", href })
    else crumbs.push({ label: LABELS[segment] ?? segment, href })
  })

  const trail = [{ label: "UAE Marketing Hub", href: "/" }, ...(crumbs.length ? crumbs : [{ label: "Dashboard", href: "/" }])]

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
      {trail.map((crumb, i) => {
        const last = i === trail.length - 1
        return (
          <span key={crumb.href + crumb.label} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0" />}
            {last ? (
              <span aria-current="page" className="truncate font-medium text-foreground">
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="truncate hover:text-foreground max-sm:hidden">
                {crumb.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
