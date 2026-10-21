"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { toast } from "sonner"
import type { SaveState } from "@/components/content/use-generator"
import type { AdsResponse } from "@/lib/ads-api"
import type { AdsResultMap } from "@/lib/ads-types"
import type { Language } from "@/lib/content-types"

type Result = AdsResultMap["fb-ad"]

/**
 * Talks to POST /api/ads/facebook and PUT /api/ads/<id>.
 * `result` is an editable copy of what the model returned; `dirty` says it differs from what was saved.
 */
export function useAdsGenerator(clientId: string) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [id, setId] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const generate = useCallback(
    async (language: Language, params: Record<string, unknown>) => {
      abort.current?.abort()
      const controller = new AbortController()
      abort.current = controller
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/ads/facebook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, language, ...params }),
          signal: controller.signal,
        })
        const body = (await res.json().catch(() => null)) as AdsResponse | { error: string } | null
        if (!res.ok || !body || "error" in body) throw new Error(body && "error" in body ? body.error : `Request failed (${res.status}).`)
        setId(body.id)
        setResult(body.result)
        setDirty(false)
        setSaveState("idle")
        toast.success("Facebook ads generated", { description: "Saved to the client's content history." })
      } catch (e) {
        if (controller.signal.aborted) return
        const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
        setError(message)
        toast.error("Couldn't generate ads", { description: message })
      } finally {
        if (abort.current === controller) setLoading(false)
      }
    },
    [clientId]
  )

  const edit = useCallback((update: (current: Result) => Result) => {
    setResult((current) => (current ? update(current) : current))
    setDirty(true)
    setSaveState("idle")
  }, [])

  const save = useCallback(async () => {
    if (!id || !result) return
    setSaveState("saving")
    try {
      const res = await fetch(`/api/ads/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ result }) })
      if (!res.ok) throw new Error()
      setDirty(false)
      setSaveState("saved")
      toast.success("Changes saved")
    } catch {
      setSaveState("error")
      toast.error("Couldn't save your changes. Try again.")
    }
  }, [id, result])

  return { loading, error, result, dirty, saveState, generate, edit, save }
}
