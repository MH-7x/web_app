"use client"

import { Check, Eye, EyeOff, KeyRound, Loader2, Plug } from "lucide-react"
import { useState } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label } from "@/components/ui/input"

type Test = { state: "idle" } | { state: "running" } | { state: "ok"; model: string } | { state: "error"; message: string }

export function ApiKeysTab({ initialMasked, model }: { initialMasked: string | null; model: string }) {
  const [masked, setMasked] = useState(initialMasked)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [test, setTest] = useState<Test>({ state: "idle" })

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/settings/api-keys", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: value }) })
      const body = (await res.json().catch(() => null)) as { masked?: string; error?: string } | null
      if (!res.ok || !body?.masked) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      setMasked(body.masked)
      setValue("")
      setShow(false)
      setEditing(false)
      setSaved(true)
      setTest({ state: "idle" })
      toast.success("API key saved to .env")
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setError(message)
      toast.error("Couldn't save the key", { description: message })
    } finally {
      setSaving(false)
    }
  }

  async function runTest() {
    setTest({ state: "running" })
    try {
      const res = await fetch("/api/settings/api-keys/test", { method: "POST" })
      const body = (await res.json().catch(() => null)) as { model?: string; error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      setTest({ state: "ok", model: body?.model ?? model })
      toast.success("Connected to Gemini")
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong."
      setTest({ state: "error", message })
      toast.error("Connection failed", { description: message })
    }
  }

  return (
    <Card className="max-w-2xl space-y-5 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <KeyRound className="size-4 text-muted-foreground" /> API Configuration
        </h2>
        <Badge variant={masked ? "success" : "destructive"}>{masked ? "Key set" : "Not set"}</Badge>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gemini-key" className="text-xs font-normal text-muted-foreground">
          Gemini API Key (GEMINI_API_KEY)
        </Label>
        {editing ? (
          <div className="flex gap-2">
            <Input id="gemini-key" type={show ? "text" : "password"} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste the new key" autoComplete="off" spellCheck={false} disabled={saving} className="h-10 font-mono" autoFocus />
            <Button type="button" variant="outline" size="icon-lg" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide key" : "Show key"} className="size-10">
              {show ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        ) : (
          <Input id="gemini-key" readOnly value={masked ?? ""} placeholder="No key in .env yet" className="h-10 font-mono" />
        )}
        <p className="text-xs text-muted-foreground">
          Stored in the <code className="font-mono">.env</code> file on the machine running this app. The full key is never sent back to the browser. Changing it takes effect immediately, no restart needed.
        </p>
      </div>

      {error && <ErrorNote message={error} />}

      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Button onClick={save} disabled={saving || !value.trim()}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />} Save key
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(false)
                setValue("")
                setError(null)
              }}
              disabled={saving}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(true)
                setSaved(false)
              }}
            >
              {masked ? "Change key" : "Add key"}
            </Button>
            <Button variant="outline" onClick={runTest} disabled={!masked || test.state === "running"}>
              {test.state === "running" ? <Loader2 className="animate-spin" /> : <Plug />} Test connection
            </Button>
          </>
        )}
        {saved && !editing && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved to .env.</span>}
      </div>

      {test.state === "ok" && (
        <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          Connected. Gemini answered using {test.model}.
        </p>
      )}
      {test.state === "error" && <ErrorNote message={test.message} />}

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        Text model: <span className="font-mono">{model}</span> (set GEMINI_MODEL in .env to change it).
      </p>
    </Card>
  )
}
