"use client"

import { Copy, Pencil, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { toast } from "sonner"
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"

/** View / Edit / Duplicate / Delete for one row of the projects table. */
export function RowActions({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function request(init: RequestInit & { url: string }, done: string) {
    setBusy(true)
    try {
      const res = await fetch(init.url, { ...init, headers: init.body ? { "Content-Type": "application/json" } : undefined })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      toast.success(done)
      router.refresh()
    } catch (e) {
      toast.error("That didn't work", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Link href={`/proposals/${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        View
      </Link>
      <Link href={`/proposals/${id}/edit`} aria-label={`Edit ${name}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
        <Pencil />
      </Link>
      <Button variant="ghost" size="icon-sm" aria-label={`Duplicate ${name}`} disabled={busy} onClick={() => request({ url: "/api/proposals", method: "POST", body: JSON.stringify({ duplicateOf: id }) }, "Project duplicated")}>
        <Copy />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} className="text-destructive hover:text-destructive" />}>
          <Trash2 />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes the project and its proposal. This cannot be undone.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <AlertDialogClose render={<Button variant="destructive" onClick={() => request({ url: `/api/proposals/${id}`, method: "DELETE" }, "Project deleted")} />}>
              <Trash2 /> Delete project
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
