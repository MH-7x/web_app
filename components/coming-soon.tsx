import { Hammer } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-20 text-center ring-1 ring-foreground/10">
        <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Hammer className="size-6" />
        </span>
        <p className="font-medium">This module is coming in a later phase</p>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        <Link href="/clients" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Back to Clients
        </Link>
      </div>
    </div>
  )
}
