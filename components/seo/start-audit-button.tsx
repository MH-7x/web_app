"use client"

import { Play } from "lucide-react"

import { Button } from "@/components/ui/button"

/** The empty state's call to action: presses the real Start Audit button in the runner above it. */
export function StartAuditButton() {
  return (
    <Button
      onClick={() => {
        const start = document.getElementById("seo-start-audit")
        start?.scrollIntoView({ behavior: "smooth", block: "center" })
        start?.click()
      }}
    >
      <Play /> Run the first audit
    </Button>
  )
}
