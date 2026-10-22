"use client"

import { Loader2, Unplug } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function DisconnectGbpButton({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function disconnect() {
    if (!window.confirm("Disconnect Google Business Profile? Posts already published stay live on Google. You can connect again at any time.")) return
    setBusy(true)
    try {
      const res = await fetch(`/api/gbp-connect?clientId=${encodeURIComponent(clientId)}`, { method: "DELETE" })
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Request failed (${res.status}).`)
      toast.success("Google Business Profile disconnected")
      router.refresh()
    } catch (e) {
      toast.error("Couldn't disconnect", { description: e instanceof Error ? e.message : "Please try again." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" size="lg" onClick={disconnect} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Unplug />} Disconnect
    </Button>
  )
}
