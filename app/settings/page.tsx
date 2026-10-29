import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import { getSession } from "@/lib/auth"
import { SettingsSkeleton } from "@/components/skeletons"
import { SettingsWorkspace } from "@/components/settings/workspace"
import { getGeminiConfig, maskSecret } from "@/lib/app-config"
import { listTemplates } from "@/lib/prompts/store"
import { getBusinessSettings } from "@/lib/settings"

export const metadata: Metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Suspense fallback={<SettingsSkeleton />}>
        <Loaded />
      </Suspense>
    </div>
  )
}

async function Loaded() {
  await connection()
  // listing also creates any prompt template that is not in the database yet
  const [templates, business, session, gemini] = await Promise.all([listTemplates(), getBusinessSettings(), getSession(), getGeminiConfig()])
  // no session cannot really happen here (proxy.ts and the layout turn it away); the lowest role is the safe fallback
  const user = { userId: session?.userId ?? "", role: session?.role ?? "admin" }
  return <SettingsWorkspace templates={templates} maskedKey={maskSecret(gemini.apiKey)} model={gemini.model} business={business} user={user} />
}
