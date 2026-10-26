"use client"

import { Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { toast } from "sonner"
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

/**
 * Delete one audit (`auditId`) or all of a client's audits (`clientId`). `viewing` is the audit open on the page;
 * if it goes, the page returns to the latest remaining audit.
 */
export function DeleteAudit({ auditId, clientId, count, label, viewing }: { auditId?: string; clientId?: string; count?: number; label: string; viewing?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const all = !auditId

  async function remove() {
    setBusy(true)
    try {
      const res = await fetch("/api/seo/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auditId ? { id: auditId } : { clientId, all: true }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      toast.success(all ? "Audit history cleared" : "Audit deleted")
      if (viewing || all) router.replace("/seo")
      router.refresh()
    } catch (e) {
      toast.error("Couldn't delete", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant={all ? "outline" : "ghost"} size="sm" aria-label={all ? undefined : `Delete audit from ${label}`} className="text-destructive hover:text-destructive" />}>
        <Trash2 /> {all ? "Clear history" : "Delete"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{all ? "Delete all audits?" : "Delete this audit?"}</AlertDialogTitle>
        <AlertDialogDescription>
          {all ? `This permanently removes all ${count} saved audits for this client, with their reports and logs.` : `This permanently removes the audit from ${label}, with its report and log.`} This cannot be undone.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
          <AlertDialogClose render={<Button variant="destructive" disabled={busy} onClick={remove} />}>
            <Trash2 /> {all ? "Delete all" : "Delete audit"}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
