import type { Metadata } from "next"

import { ProjectForm } from "@/components/proposals/project-form"

export const metadata: Metadata = { title: "New Project" }

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New Project</h1>
        <p className="text-sm text-muted-foreground">Fill in what the client told you. Nothing is sent to them.</p>
      </header>
      <ProjectForm mode="create" />
    </div>
  )
}
