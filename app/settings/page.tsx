import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import { SettingsSkeleton } from "@/components/skeletons"
import { SettingsWorkspace } from "@/components/settings/workspace"
import { maskSecret } from "@/lib/env-file"
import { GEMINI_MODEL } from "@/lib/gemini"
import { listTemplates } from "@/lib/prompts/store"

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
  const templates = await listTemplates()
  return <SettingsWorkspace templates={templates} maskedKey={maskSecret(process.env.GEMINI_API_KEY)} model={GEMINI_MODEL} />
}
