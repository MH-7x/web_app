import { cookies } from "next/headers"
import { Suspense } from "react"

import { Breadcrumb } from "@/components/breadcrumb"
import { ClientSelector } from "@/components/client-selector"
import { ThemeToggle } from "@/components/theme-toggle"
import { ACTIVE_CLIENT_COOKIE } from "@/lib/constants"
import { getClientOptions } from "@/lib/clients"

async function ActiveClientSelector() {
  const [jar, clients] = await Promise.all([cookies(), getClientOptions()])
  const cookieId = jar.get(ACTIVE_CLIENT_COOKIE)?.value ?? null
  // a cookie can outlive its client (deleted elsewhere) - fall back to "none"
  const activeId = clients.some((c) => c.id === cookieId) ? cookieId : null
  return <ClientSelector clients={clients} activeId={activeId} />
}

function SelectorFallback() {
  return <div className="h-8 w-64 max-w-full animate-pulse rounded-lg bg-muted" />
}

export function Topbar() {
  return (
    <header className="fixed top-0 right-0 left-[200px] z-20 grid h-12 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
      <Suspense fallback={<span className="text-sm text-muted-foreground">UAE Marketing Hub</span>}>
        <Breadcrumb />
      </Suspense>

      <Suspense fallback={<SelectorFallback />}>
        <ActiveClientSelector />
      </Suspense>

      <div className="flex items-center justify-end gap-1.5">
        <ThemeToggle />
        <span
          aria-label="Mashal Huraira"
          title="Mashal Huraira"
          className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          MH
        </span>
      </div>
    </header>
  )
}
