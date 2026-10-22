import { SearchX } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { buttonVariants } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <EmptyState icon={SearchX} title="Page not found" description="That page or item doesn't exist, or it was deleted.">
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          Back to dashboard
        </Link>
        <Link href="/clients" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Clients
        </Link>
      </EmptyState>
    </div>
  )
}
