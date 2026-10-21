/** Client-side runner for the onboarding "Initial Setup" step: calls the module APIs one after another. No server imports. */

import { dateKey } from "@/lib/gbp-posts-types"

export type SetupStepId = "gbp-description" | "faq" | "gbp-posts" | "fb-ads"

export type SetupClient = { id: string; name: string; emirate: string; services: string[]; areas: string[] }

export const STEP_LABELS: Record<SetupStepId, { running: string; title: string }> = {
  "gbp-description": { title: "GBP description", running: "Writing the Google Business Profile description in Arabic and English" },
  faq: { title: "10 FAQ items", running: "Writing 10 FAQ items in Arabic and English" },
  "gbp-posts": { title: "Month of GBP posts", running: "Writing four weeks of Google Business Profile posts" },
  "fb-ads": { title: "3 Facebook ad variations", running: "Writing 3 Facebook ad variations in Arabic and English" },
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${res.status}).`)
  return data ?? {}
}

/** Search phrases for the month of posts, taken from what the client offers and where. */
export function startingKeywords(c: SetupClient) {
  const list = [
    ...c.services.slice(0, 3).map((s) => `${s.toLowerCase()} in ${c.emirate}`),
    `movers in ${c.emirate}`,
    `packers and movers ${c.emirate}`,
    ...(c.areas[0] ? [`movers in ${c.areas[0]}`] : []),
  ]
  return [...new Set(list)].slice(0, 6)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Run one step. `progress` reports detail text while it works. Returns a short summary of what was made. */
export async function runSetupStep(id: SetupStepId, c: SetupClient, progress: (detail: string) => void): Promise<string> {
  switch (id) {
    case "gbp-description":
      await post("/api/content/gbp", { clientId: c.id, language: "both", options: { highlights: [], maxChars: 750 } })
      return "Written in Arabic and English"
    case "faq":
      await post("/api/content/faq", { clientId: c.id, language: "both", options: { count: 10, topic: "" } })
      return "10 questions in Arabic and English"
    case "fb-ads":
      await post("/api/ads/facebook", { clientId: c.id, language: "both", emirate: c.emirate, objective: "messages", offer: "", audience: "", count: 3 })
      return `3 ad variations for ${c.emirate}`
    case "gbp-posts": {
      const started = await post("/api/gbp-posts/generate", { clientId: c.id, weeks: 4, keywords: startingKeywords(c), language: "both", startDate: dateKey(new Date()) })
      const job = started.job as { id: string }
      const deadline = Date.now() + 20 * 60_000
      while (Date.now() < deadline) {
        await sleep(2000)
        const res = await fetch(`/api/gbp-posts/jobs/${job.id}`, { cache: "no-store" })
        const data = (await res.json().catch(() => null)) as { job?: { status: string; written: number; total: number; error: string | null }; error?: string } | null
        if (!res.ok || !data?.job) throw new Error(data?.error ?? `Request failed (${res.status}).`)
        const j = data.job
        progress(`${j.written} of ${j.total} posts written`)
        if (j.status === "failed") throw new Error(j.error ?? "Writing the posts failed.")
        if (j.status === "completed") return `${j.written} posts on the calendar as drafts`
      }
      throw new Error("Writing the posts is taking too long. Check the GBP Posts page for what was saved.")
    }
  }
}
