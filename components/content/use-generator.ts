"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { toast } from "sonner"
import type { ErrorResponse, GenerateResponse } from "@/lib/content-api"
import type { ContentType, Language, OptionsMap, ResultMap } from "@/lib/content-types"

const NAMES = { gbp: "GBP description", faq: "FAQ items", blog: "Blog post", meta: "Meta tags" } as const

export type SaveState = "idle" | "saving" | "saved" | "error"

export type HumanizeInfo = { before: number; after: number; pieces: number; warnings: string[] }

/**
 * Talks to POST /api/content/<type> and PUT /api/content/<id>.
 * `result` is an editable copy of what the model returned; `dirty` says it differs from what was saved.
 */
export function useGenerator<T extends ContentType>(type: T, clientId: string) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [id, setId] = useState<string | null>(null)
  const [language, setLanguage] = useState<Language | null>(null)
  const [result, setResult] = useState<ResultMap[T] | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [humanizing, setHumanizing] = useState(false)
  const [humanizeError, setHumanizeError] = useState<string | null>(null)
  /** set after Humanize; `undo` puts `previous` back */
  const [humanized, setHumanized] = useState<(HumanizeInfo & { previous: ResultMap[T] }) | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const generate = useCallback(
    async (lang: Language, options: OptionsMap[T]) => {
      abort.current?.abort()
      const controller = new AbortController()
      abort.current = controller
      setLoading(true)
      setError(null)
      setHumanized(null)
      setHumanizeError(null)
      try {
        const res = await fetch(`/api/content/${type}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, language: lang, options }),
          signal: controller.signal,
        })
        const body = (await res.json().catch(() => null)) as GenerateResponse<T> | ErrorResponse | null
        if (!res.ok || !body || "error" in body) {
          throw new Error(body && "error" in body ? body.error : `Request failed (${res.status}).`)
        }
        setId(body.id)
        setLanguage(body.language)
        setResult(body.result)
        setDirty(false)
        setSaveState("idle")
        toast.success(`${NAMES[type]} generated`, { description: "Saved to the client's content history." })
      } catch (e) {
        if (controller.signal.aborted) return
        const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
        setError(message)
        toast.error("Couldn't generate", { description: message })
      } finally {
        if (abort.current === controller) setLoading(false)
      }
    },
    [type, clientId]
  )

  const edit = useCallback((update: (current: ResultMap[T]) => ResultMap[T]) => {
    setResult((current) => (current ? update(current) : current))
    setDirty(true)
    setSaveState("idle")
  }, [])

  const save = useCallback(async () => {
    if (!id || !result) return
    setSaveState("saving")
    try {
      const res = await fetch(`/api/content/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result, ...(humanized && { humanized: { score: humanized.after } }) }),
      })
      if (!res.ok) throw new Error()
      setDirty(false)
      setSaveState("saved")
      toast.success("Changes saved")
    } catch {
      setSaveState("error")
      toast.error("Couldn't save your changes. Try again.")
    }
  }, [id, result, humanized])

  /** Rewrite what is on screen (unsaved edits included) with the humanizer and replace the preview with it. */
  const humanize = useCallback(
    async (strictness: "light" | "medium" | "strict") => {
      if (!result) return
      setHumanizing(true)
      setHumanizeError(null)
      try {
        const res = await fetch("/api/humanizer/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, result, strictness }),
        })
        const body = (await res.json().catch(() => null)) as { result?: ResultMap[T]; units?: { beforeScore: number; afterScore: number; warnings: string[] }[]; error?: string } | null
        if (!res.ok || !body?.result || !body.units) throw new Error(body?.error ?? `Request failed (${res.status}).`)
        const mean = (pick: (u: { beforeScore: number; afterScore: number }) => number) => Math.round(body.units!.reduce((s, u) => s + pick(u), 0) / Math.max(1, body.units!.length))
        setHumanized({
          previous: humanized?.previous ?? result,
          before: humanized?.before ?? mean((u) => u.beforeScore),
          after: mean((u) => u.afterScore),
          pieces: body.units.length,
          warnings: [...new Set(body.units.flatMap((u) => u.warnings))],
        })
        setResult(body.result)
        setDirty(true)
        setSaveState("idle")
        toast.success("Humanized", { description: "Save changes to keep the rewrite." })
      } catch (e) {
        const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
        setHumanizeError(message)
        toast.error("Couldn't humanize", { description: message })
      } finally {
        setHumanizing(false)
      }
    },
    [type, result, humanized]
  )

  const undoHumanize = useCallback(() => {
    if (!humanized) return
    setResult(humanized.previous)
    setHumanized(null)
    setDirty(true)
    setSaveState("idle")
  }, [humanized])

  const humanizer = {
    run: humanize,
    undo: undoHumanize,
    busy: humanizing,
    error: humanizeError,
    info: humanized ? { before: humanized.before, after: humanized.after, pieces: humanized.pieces, warnings: humanized.warnings } : null,
  }

  return { loading, error, id, language, result, dirty, saveState, generate, edit, save, humanizer }
}

export type Generator<T extends ContentType> = ReturnType<typeof useGenerator<T>>
