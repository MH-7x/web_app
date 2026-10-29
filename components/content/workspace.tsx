"use client"

import { Building2, Code2, FileText, HelpCircle, LayoutTemplate, Store } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { BlogPanel } from "@/components/content/blog-panel"
import { FaqPanel } from "@/components/content/faq-panel"
import { GbpPanel } from "@/components/content/gbp-panel"
import { LandingPagePanel } from "@/components/content/landing-page-panel"
import { LocalOnlyNotice } from "@/components/local-only-notice"
import { MetaPanel } from "@/components/content/meta-panel"
import { TYPE_TITLES } from "@/components/content/parts"
import { Badge } from "@/components/ui/badge"
import type { ContentType } from "@/lib/content-types"
import { cn } from "@/lib/utils"

export type WorkspaceClient = {
  id: string
  name: string
  slug: string
  emirate: string
  /** the primary emirate first, then the others served */
  emirates: string[]
  areas: string[]
  services: string[]
  phone: string
  whatsapp: string
  primaryColor: string
  hasCompanyProfile: boolean
}

type TabId = ContentType | "landing"

const TITLES: Record<TabId, string> = { ...TYPE_TITLES, landing: "Landing Page" }

const TABS: { id: TabId; icon: typeof Store }[] = [
  { id: "gbp", icon: Store },
  { id: "faq", icon: HelpCircle },
  { id: "blog", icon: FileText },
  { id: "meta", icon: Code2 },
  { id: "landing", icon: LayoutTemplate },
]

/** landingPageDisabled: the live site. Landing pages (and competitor insights) are generated from the app on your computer. */
export function ContentWorkspace({ client, landingPageDisabled }: { client: WorkspaceClient; landingPageDisabled: boolean }) {
  const [tab, setTab] = useState<TabId>("gbp")

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Building2 className="size-4" />
        </span>
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Generating for</span>
        <span className="font-semibold">{client.name}</span>
        <Badge variant="muted">{client.emirate}</Badge>
        <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
          <span className="max-md:hidden">Switch client from the top bar</span>
          <Link href={`/clients/${client.id}`} className="text-primary hover:underline">
            View profile
          </Link>
        </div>
      </div>

      <div role="tablist" aria-label="Content type" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:grid-cols-5">
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            type="button"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
              if (!dir) return
              const next = TABS[(TABS.findIndex((t) => t.id === id) + dir + TABS.length) % TABS.length].id
              setTab(next)
              document.getElementById(`tab-${next}`)?.focus()
            }}
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors [&_svg]:size-4",
              tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon />
            {TITLES[id]}
          </button>
        ))}
      </div>

      {/* every panel stays mounted so switching tabs never loses generated output */}
      <div id="panel-gbp" role="tabpanel" aria-labelledby="tab-gbp" hidden={tab !== "gbp"}>
        <GbpPanel client={client} />
      </div>
      <div id="panel-faq" role="tabpanel" aria-labelledby="tab-faq" hidden={tab !== "faq"}>
        <FaqPanel client={client} />
      </div>
      <div id="panel-blog" role="tabpanel" aria-labelledby="tab-blog" hidden={tab !== "blog"}>
        <BlogPanel client={client} />
      </div>
      <div id="panel-meta" role="tabpanel" aria-labelledby="tab-meta" hidden={tab !== "meta"}>
        <MetaPanel client={client} />
      </div>
      <div id="panel-landing" role="tabpanel" aria-labelledby="tab-landing" hidden={tab !== "landing"}>
        {landingPageDisabled ? (
          <LocalOnlyNotice title="The landing page generator">
            <p className="text-muted-foreground">Landing pages you save from there are listed in this client&apos;s Content History.</p>
          </LocalOnlyNotice>
        ) : (
          <LandingPagePanel client={client} />
        )}
      </div>
    </div>
  )
}
