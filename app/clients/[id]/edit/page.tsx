import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { FormSkeleton } from "@/components/skeletons"
import { ClientForm } from "@/components/client-form"
import { normalizeUaeNumber, displayDomain, type ClientInput } from "@/lib/client-schema"
import { getClient } from "@/lib/clients"

export const metadata: Metadata = { title: "Edit Client" }

function national(e164: string) {
  const n = normalizeUaeNumber(e164)
  return n.length >= 8 ? `${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}` : n
}

export default function EditClientPage(props: PageProps<"/clients/[id]/edit">) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Edit Client</h1>
        <p className="text-sm text-muted-foreground">Update company details, brand specs and coverage.</p>
      </header>
      <Suspense fallback={<FormSkeleton />}>
        <EditForm params={props.params} />
      </Suspense>
    </div>
  )
}

async function EditForm({ params }: { params: PageProps<"/clients/[id]/edit">["params"] }) {
  const { id } = await params
  const client = await getClient(id)
  if (!client) notFound()

  const initial: ClientInput = {
    category: client.category,
    name: client.name,
    nameAr: client.nameAr,
    emirate: client.emirate,
    emiratesServed: client.emiratesServed,
    website: client.website ? displayDomain(client.website) : "",
    phone: national(client.phone),
    whatsapp: national(client.whatsapp),
    areas: client.areas,
    services: client.services,
    primaryColor: client.primaryColor ?? "#0f766e",
    secondaryColor: client.secondaryColor ?? "#e2e8f0",
    truckType: client.truckType,
    uniform: client.uniform,
    tones: client.tones,
    notes: client.notes,
    initialSetup: client.initialSetup,
    facebookUrl: client.facebookUrl,
    instagramUrl: client.instagramUrl,
    driveLink: client.driveLink,
    otherLinks: client.otherLinks,
  }

  return <ClientForm mode="edit" clientId={client.id} initial={initial} />
}
