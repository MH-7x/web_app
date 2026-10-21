"use client"

import { Check, CircleDashed, Loader2, RefreshCw, Square, TriangleAlert, UserRoundCheck } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { STEP_LABELS, runSetupStep, type SetupClient, type SetupStepId } from "@/lib/onboarding"
import { cn } from "@/lib/utils"

type Status = { state: "pending" } | { state: "running"; detail?: string } | { state: "done"; summary: string } | { state: "error"; message: string } | { state: "stopped" }

/**
 * Shown after "Create Client & Generate": the client is already saved, and each ticked item is generated in order.
 * A failed item does not stop the rest; it can be retried here or later from its own module.
 */
export function SetupProgress({ client, steps }: { client: SetupClient; steps: SetupStepId[] }) {
  const [status, setStatus] = useState<Record<string, Status>>(() => Object.fromEntries(steps.map((s) => [s, { state: "pending" } as Status])))
  const [running, setRunning] = useState(false)
  const stop = useRef(false)
  const started = useRef(false)

  async function run(ids: SetupStepId[]) {
    stop.current = false
    setRunning(true)
    setStatus((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, { state: "pending" } as Status])) }))
    for (const id of ids) {
      if (stop.current) {
        setStatus((s) => ({ ...s, [id]: { state: "stopped" } }))
        continue
      }
      setStatus((s) => ({ ...s, [id]: { state: "running" } }))
      try {
        const summary = await runSetupStep(id, client, (detail) => setStatus((s) => (s[id]?.state === "running" ? { ...s, [id]: { state: "running", detail } } : s)))
        setStatus((s) => ({ ...s, [id]: { state: "done", summary } }))
      } catch (e) {
        const message = e instanceof Error ? e.message : "Something went wrong."
        setStatus((s) => ({ ...s, [id]: { state: "error", message } }))
        toast.error(`${STEP_LABELS[id].title} failed`, { description: message })
      }
    }
    setRunning(false)
    if (!stop.current) toast.success("Starter content is ready", { description: "It's saved to the client's content history." })
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void run(steps)
    // runs once when the panel appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // leaving mid-run would drop the steps that have not started yet
  useEffect(() => {
    if (!running) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [running])

  const list = steps.map((id) => ({ id, ...STEP_LABELS[id], status: status[id] ?? ({ state: "pending" } as Status) }))
  const finished = list.filter((s) => s.status.state === "done" || s.status.state === "error" || s.status.state === "stopped").length
  const failed = list.filter((s) => s.status.state === "error" || s.status.state === "stopped").map((s) => s.id)

  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UserRoundCheck className="size-5" />
        </span>
        <div className="space-y-0.5">
          <h2 className="text-lg font-semibold">{client.name} is created</h2>
          <p className="text-sm text-muted-foreground">{running ? "Generating the starter content. Keep this tab open until it finishes." : failed.length ? "Done, with a few items to look at." : "All set. Everything below is saved to the client's content history."}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {finished} of {list.length} finished
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={list.length} aria-valuenow={finished}>
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(finished / Math.max(1, list.length)) * 100}%` }} />
        </div>
      </div>

      <ol className="space-y-2" aria-live="polite">
        {list.map((s) => (
          <li key={s.id} className={cn("flex items-start gap-3 rounded-lg px-4 py-3 ring-1 ring-foreground/10", s.status.state === "error" && "bg-destructive/5 ring-destructive/30")}>
            <span className="mt-0.5">
              {s.status.state === "running" ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : s.status.state === "done" ? (
                <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
              ) : s.status.state === "error" ? (
                <TriangleAlert className="size-4 text-destructive" />
              ) : (
                <CircleDashed className="size-4 text-muted-foreground" />
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm font-medium">{s.title}</p>
              <p className={cn("text-sm", s.status.state === "error" ? "text-destructive" : "text-muted-foreground")}>
                {s.status.state === "pending" && "Waiting"}
                {s.status.state === "running" && `${s.running}${s.status.detail ? ` · ${s.status.detail}` : "…"}`}
                {s.status.state === "done" && s.status.summary}
                {s.status.state === "error" && s.status.message}
                {s.status.state === "stopped" && "Skipped. Generate it later from its module."}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
        {running ? (
          <Button variant="outline" onClick={() => (stop.current = true)}>
            <Square /> Stop after the current item
          </Button>
        ) : (
          <>
            <Link href={`/clients/${client.id}`} className={buttonVariants({ size: "lg" })}>
              Open client profile
            </Link>
            {failed.length > 0 && (
              <Button variant="outline" size="lg" onClick={() => void run(failed as SetupStepId[])}>
                <RefreshCw /> Retry {failed.length === 1 ? "the failed item" : `${failed.length} items`}
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
