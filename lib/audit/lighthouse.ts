import type { LighthouseOpportunity, LighthouseRun } from "@/lib/audit/types"

const TIMEOUT_MS = 180_000

type Audit = { numericValue?: number; score?: number | null; title?: string; details?: { overallSavingsMs?: number; overallSavingsBytes?: number; summary?: { wastedBytes?: number }; type?: string } }

const num = (a: Audit | undefined) => (typeof a?.numericValue === "number" ? a.numericValue : null)

/**
 * A Lighthouse performance run against a browser that is already open (it connects over the DevTools port).
 * Returns null if Lighthouse fails or times out, so one flaky run never loses the whole audit.
 */
export async function runLighthouse(url: string, port: number, device: "mobile" | "desktop"): Promise<LighthouseRun | null> {
  try {
    const { default: lighthouse } = await import("lighthouse")
    const config = device === "desktop" ? (await import("lighthouse/core/config/desktop-config.js")).default : undefined
    const run = lighthouse(url, { port, output: "json", logLevel: "error", onlyCategories: ["performance"] }, config)
    const result = await Promise.race([run, new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS))])
    const lhr = result?.lhr
    const perf = lhr?.categories?.performance?.score
    if (!lhr || perf == null) return null
    const audits = lhr.audits as unknown as Record<string, Audit>

    // audits that name a saving, biggest first: render-blocking requests, image delivery, unused JavaScript, caching...
    const opportunities: LighthouseOpportunity[] = []
    for (const [id, a] of Object.entries(audits)) {
      if (a.score == null || a.score >= 0.9) continue
      const ms = a.details?.overallSavingsMs ?? 0
      const bytes = a.details?.overallSavingsBytes ?? a.details?.summary?.wastedBytes ?? 0
      if (ms > 0 || bytes > 0) opportunities.push({ id, title: a.title ?? id, savingsMs: Math.round(ms), savingsBytes: Math.round(bytes) })
    }
    opportunities.sort((x, y) => y.savingsMs - x.savingsMs || y.savingsBytes - x.savingsBytes)

    return {
      url,
      device,
      score: Math.round(perf * 100),
      fcpMs: num(audits["first-contentful-paint"]),
      speedIndexMs: num(audits["speed-index"]),
      lcpMs: num(audits["largest-contentful-paint"]),
      tbtMs: num(audits["total-blocking-time"]),
      cls: num(audits["cumulative-layout-shift"]),
      opportunities: opportunities.slice(0, 10),
    }
  } catch (error) {
    console.error(`[audit] lighthouse ${device} failed for ${url}:`, error instanceof Error ? error.message : error)
    return null
  }
}
