"use client"

import { useState } from "react"

import { ApiKeysTab } from "@/components/settings/api-keys-tab"
import { GeneralTab } from "@/components/settings/general-tab"
import { PromptsTab } from "@/components/settings/prompts-tab"
import { SessionLogTab } from "@/components/settings/session-log-tab"
import { UsersTab } from "@/components/settings/users-tab"
import type { BusinessSettings } from "@/lib/business-types"
import type { TemplateRecord } from "@/lib/prompts/store"
import { cn } from "@/lib/utils"

const TABS = [
  { id: "general", label: "General" },
  { id: "prompts", label: "Prompt Templates" },
  { id: "keys", label: "API Keys" },
  { id: "users", label: "Users", superAdminOnly: true },
  { id: "sessions", label: "Session Log" },
] as const

type Tab = (typeof TABS)[number]["id"]

export function SettingsWorkspace({
  templates,
  maskedKey,
  model,
  business,
  user,
}: {
  templates: TemplateRecord[]
  maskedKey: string | null
  model: string
  business: BusinessSettings
  user: { userId: string; role: string }
}) {
  const [tab, setTab] = useState<Tab>("general")
  const isSuperAdmin = user.role === "super_admin"
  // the Users tab is not offered to admins (the API refuses them as well)
  const tabs = TABS.filter((t) => !("superAdminOnly" in t) || isSuperAdmin)

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Settings" className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`st-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`st-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn("-mb-px border-b-2 px-4 pb-2.5 text-sm font-medium transition-colors", tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* all stay mounted so an unsaved prompt edit survives a visit to another tab */}
      <div id="st-panel-general" role="tabpanel" aria-labelledby="st-tab-general" hidden={tab !== "general"}>
        <GeneralTab business={business} />
      </div>
      <div id="st-panel-prompts" role="tabpanel" aria-labelledby="st-tab-prompts" hidden={tab !== "prompts"}>
        <PromptsTab initial={templates} />
      </div>
      <div id="st-panel-keys" role="tabpanel" aria-labelledby="st-tab-keys" hidden={tab !== "keys"}>
        <ApiKeysTab initialMasked={maskedKey} model={model} />
      </div>
      {/* these two load their data when opened, so they are only mounted while selected */}
      {tab === "users" && isSuperAdmin && (
        <div id="st-panel-users" role="tabpanel" aria-labelledby="st-tab-users">
          <UsersTab currentUserId={user.userId} />
        </div>
      )}
      {tab === "sessions" && (
        <div id="st-panel-sessions" role="tabpanel" aria-labelledby="st-tab-sessions">
          <SessionLogTab canFilterUsers={isSuperAdmin} />
        </div>
      )}
    </div>
  )
}
