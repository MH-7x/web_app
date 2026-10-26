import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { ProjectForm } from "@/components/proposals/project-form"
import { FormSkeleton } from "@/components/skeletons"
import { getProject } from "@/lib/proposals"

export const metadata: Metadata = { title: "Edit Project" }

export default function EditProjectPage(props: PageProps<"/proposals/[id]/edit">) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Edit Project</h1>
        <p className="text-sm text-muted-foreground">Changes are saved to the project. Regenerate the proposal afterwards to reflect them.</p>
      </header>
      <Suspense fallback={<FormSkeleton />}>
        <Loaded params={props.params} />
      </Suspense>
    </div>
  )
}

async function Loaded({ params }: { params: PageProps<"/proposals/[id]/edit">["params"] }) {
  await connection()
  const project = await getProject((await params).id)
  if (!project) notFound()
  return <ProjectForm mode="edit" projectId={project.id} initial={project} />
}
