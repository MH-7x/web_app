"use client"

import { Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition, type ReactElement } from "react"

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { deleteClientAction } from "@/lib/actions"

export function DeleteClientDialog({
  clientId,
  clientName,
  contentCount,
  redirectTo,
  trigger,
}: {
  clientId: string
  clientName: string
  contentCount: number
  redirectTo?: "/clients"
  trigger: ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogTitle>Delete {clientName}?</AlertDialogTitle>
        <AlertDialogDescription>
          This permanently removes the client
          {contentCount > 0 ? ` and its ${contentCount} generated content ${contentCount === 1 ? "item" : "items"}` : ""}.
          This cannot be undone.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" disabled={pending} />}>Cancel</AlertDialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteClientAction(clientId)
                  toast.success("Client deleted", { description: clientName })
                  setOpen(false)
                  if (redirectTo) router.push(redirectTo)
                } catch {
                  toast.error("Couldn't delete the client. Try again.")
                }
              })
            }
          >
            <Trash2 /> {pending ? "Deleting…" : "Delete client"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
