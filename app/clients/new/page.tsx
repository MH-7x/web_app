import type { Metadata } from "next"

import { ClientForm } from "@/components/client-form"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = { title: "Add Client" }

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="space-y-2">
        <Badge>Client Onboarding</Badge>
        <h1 className="text-2xl font-semibold tracking-tight">New Moving Company Client</h1>
        <p className="text-sm text-muted-foreground">Add a new client and configure its initial marketing assets for the UAE market.</p>
      </header>
      <ClientForm mode="create" />
    </div>
  )
}
