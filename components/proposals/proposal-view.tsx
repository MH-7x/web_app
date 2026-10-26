"use client"

import { Check, Copy, FileDown, Loader2, Pencil, RefreshCw, Save, Send, Sparkles, UserPlus, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { ProposalDocument } from "@/components/proposals/proposal-document"
import { StatusBadge } from "@/components/proposals/status-badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Select, Textarea } from "@/components/ui/input"
import type { BusinessSettings } from "@/lib/business-types"
import { proposalText } from "@/lib/proposal-text"
import { STATUSES, formatAed, type ProjectData, type ProjectStatus } from "@/lib/proposals-types"

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined })
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !body) throw new Error(body?.error ?? `Request failed (${res.status}).`)
  return body
}

export function ProposalView({ project: initial, business, dateLabel }: { project: ProjectData; business: BusinessSettings; dateLabel: string }) {
  const router = useRouter()
  const [project, setProject] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial.proposal)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const hasProposal = project.proposal.trim() !== ""

  /** Run a request, show its error in the page, and report whether it worked. */
  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setBusy(null)
    }
  }

  const save = (patch: Record<string, unknown>) => call<{ project: ProjectData }>(`/api/proposals/${project.id}`, { method: "PUT", body: JSON.stringify(patch) }).then((b) => setProject(b.project))

  const generate = () =>
    run("generate", async () => {
      const b = await call<{ proposal: string }>(`/api/proposals/${project.id}/generate`, { method: "POST" })
      setProject((p) => ({ ...p, proposal: b.proposal }))
      setDraft(b.proposal)
      setEditing(false)
      toast.success("Proposal generated")
    })

  const changeStatus = (status: ProjectStatus) => run("status", () => save({ status }).then(() => void toast.success(`Marked as ${status}`)))

  const saveEdit = () =>
    run("edit", async () => {
      await save({ proposal: draft })
      setEditing(false)
      toast.success("Proposal saved")
    })

  const convert = () =>
    run("convert", async () => {
      const b = await call<{ clientId: string; created: boolean }>(`/api/proposals/${project.id}/convert`, { method: "POST" })
      if (b.created) toast.success("Client created", { description: "Add the Arabic name and check the services." })
      router.push(b.created ? `/clients/${b.clientId}/edit` : `/clients/${b.clientId}`)
    })

  async function copyText() {
    try {
      await navigator.clipboard.writeText(proposalText({ clientName: project.clientName, markdown: project.proposal, business, dateLabel }))
      toast.success("Copied. Paste it into WhatsApp.")
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy. Allow clipboard access for this site and try again.")
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 print:hidden">
        <div className="min-w-56 flex-1 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <StatusBadge status={project.status} />
            <span>{project.clientName}</span>
            <span className="tabular-nums">{formatAed(project.totalCost)}</span>
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Status
          <Select aria-label="Project status" value={project.status} onChange={(e) => changeStatus(e.target.value as ProjectStatus)} disabled={busy !== null} className="w-32">
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </label>
        <Link href={`/proposals/${project.id}/edit`} className={buttonVariants({ variant: "outline" })}>
          <Pencil /> Edit project
        </Link>
        {project.clientId ? (
          <Link href={`/clients/${project.clientId}`} className={buttonVariants({ variant: "outline" })}>
            <UserPlus /> Open client
          </Link>
        ) : (
          <Button variant="outline" onClick={convert} disabled={busy !== null}>
            {busy === "convert" ? <Loader2 className="animate-spin" /> : <UserPlus />} Convert to Client
          </Button>
        )}
      </div>

      {error && <ErrorNote message={error} />}

      {!hasProposal ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-16 text-center ring-1 ring-foreground/10 print:hidden">
          <Sparkles className="size-8 text-muted-foreground/60" />
          <p className="font-medium">No proposal yet</p>
          <p className="max-w-md text-sm text-muted-foreground">Gemini writes it from this project&apos;s pages, services and prices. It takes about half a minute.</p>
          <Button onClick={generate} disabled={busy !== null}>
            {busy === "generate" ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy === "generate" ? "Writing the proposal…" : "Generate Proposal"}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 print:hidden">
            {editing ? (
              <>
                <Button onClick={saveEdit} disabled={busy !== null || !draft.trim()}>
                  {busy === "edit" ? <Loader2 className="animate-spin" /> : <Save />} Save changes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft(project.proposal)
                    setEditing(false)
                  }}
                  disabled={busy !== null}
                >
                  <X /> Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil /> Edit Proposal
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <FileDown /> Export PDF
                </Button>
                <Button variant="outline" onClick={copyText}>
                  {copied ? <Check /> : <Copy />} Copy Text
                </Button>
                {project.status === "draft" && (
                  <Button onClick={() => changeStatus("sent")} disabled={busy !== null}>
                    {busy === "status" ? <Loader2 className="animate-spin" /> : <Send />} Mark as Sent
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm("Write a new proposal? This replaces the current text, including any edits you made.")) void generate()
                  }}
                  disabled={busy !== null}
                >
                  {busy === "generate" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate
                </Button>
              </>
            )}
          </div>

          {editing ? (
            <div className="grid gap-4 lg:grid-cols-2 print:hidden">
              <div className="space-y-1.5">
                <label htmlFor="proposal-editor" className="text-sm font-medium">
                  Proposal text (markdown)
                </label>
                <Textarea id="proposal-editor" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck className="min-h-[32rem] font-mono text-xs" />
                <p className="text-xs text-muted-foreground">Use ## for headings, - for bullets and | for tables. The preview updates as you type.</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Preview</p>
                <ProposalDocument clientName={project.clientName} projectName={project.name} markdown={draft} business={business} dateLabel={dateLabel} />
              </div>
            </div>
          ) : (
            <div className="print-area">
              <ProposalDocument clientName={project.clientName} projectName={project.name} markdown={project.proposal} business={business} dateLabel={dateLabel} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
