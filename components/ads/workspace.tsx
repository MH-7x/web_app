"use client"

import { Building2 } from "lucide-react"
import Link from "next/link"

import { FacebookPanel } from "@/components/ads/facebook-panel"
import { Badge } from "@/components/ui/badge"

export type AdsClient = {
  id: string
  name: string
  slug: string
  emirate: string
  /** where the client is based plus the other emirates it serves */
  emirates: string[]
  website: string | null
}

export function AdsWorkspace({ client }: { client: AdsClient }) {
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

      <FacebookPanel client={client} />
    </div>
  )
}
