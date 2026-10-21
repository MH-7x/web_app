"use client"

import { useState } from "react"

import { BatchMode } from "@/components/humanizer/batch-mode"
import { PasteMode } from "@/components/humanizer/paste-mode"
import type { Strictness } from "@/lib/humanizer-types"
import { cn } from "@/lib/utils"

const TABS = [
  { id: "paste", label: "Paste Mode" },
  { id: "batch", label: "Batch Mode" },
] as const

export function HumanizerWorkspace({ client }: { client: { id: string; name: string } | null }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("paste")
  const [strictness, setStrictness] = useState<Strictness>("medium")

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Humanizer mode" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`hz-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`hz-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-4 pb-2.5 text-sm font-medium transition-colors",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* both stay mounted so switching modes keeps the pasted text and the batch results */}
      <div id="hz-panel-paste" role="tabpanel" aria-labelledby="hz-tab-paste" hidden={tab !== "paste"}>
        <PasteMode clientId={client?.id ?? null} strictness={strictness} onStrictness={setStrictness} />
      </div>
      <div id="hz-panel-batch" role="tabpanel" aria-labelledby="hz-tab-batch" hidden={tab !== "batch"}>
        <BatchMode client={client} strictness={strictness} onStrictness={setStrictness} />
      </div>
    </div>
  )
}
