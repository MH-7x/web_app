"use client"

import { TriangleAlert } from "lucide-react"
import { useEffect } from "react"

import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"

/** Anything that throws while a page renders lands here instead of a blank screen. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto max-w-2xl py-10">
      <EmptyState icon={TriangleAlert} title="Something went wrong" description="This page could not be loaded. Your data is safe. Try again, and if it keeps happening, check the server log.">
        <Button size="lg" onClick={() => retry()}>
          Try again
        </Button>
      </EmptyState>
    </div>
  )
}
