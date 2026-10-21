import type { CruxMetric, CruxRecord, CruxResult } from "@/lib/audit/types"

/**
 * Real-user Core Web Vitals from the Chrome UX Report API (field data, as opposed to Lighthouse's lab data).
 * Needs CRUX_API_KEY in .env. A page with too little traffic has no page-level data, so the whole site's (origin) data
 * is used instead and labelled that way. Missing data is reported as unavailable, never as zero.
 */

const ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord"
const DEVICES = [
  { api: "PHONE", name: "phone" },
  { api: "DESKTOP", name: "desktop" },
] as const

type Raw = { histogram?: { density?: number }[]; percentiles?: { p75?: number | string } }

function metric(raw: Raw | undefined): CruxMetric | null {
  if (!raw) return null
  const p75 = raw.percentiles?.p75
  const d = raw.histogram ?? []
  const n = (v: number | undefined) => (typeof v === "number" ? Math.round(v * 1000) / 10 : null)
  return {
    p75: p75 === undefined ? null : Number(p75),
    good: n(d[0]?.density),
    needsImprovement: n(d[1]?.density),
    poor: n(d[2]?.density),
  }
}

type Query = { status: number; reason: string; body?: { record?: { metrics?: Record<string, Raw> } } }

async function query(key: string, target: { url?: string; origin?: string }, formFactor: string): Promise<Query> {
  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...target, formFactor }),
      signal: AbortSignal.timeout(15_000),
    })
    const body = await res.json().catch(() => ({}))
    return { status: res.status, reason: body?.error?.details?.[0]?.reason ?? body?.error?.status ?? "", body }
  } catch {
    return { status: 0, reason: "NETWORK" }
  }
}

export async function fetchCrux(urls: string[], origin: string): Promise<CruxResult> {
  const key = process.env.CRUX_API_KEY?.trim()
  if (!key) return { records: [], unavailable: "CRUX_API_KEY is not set in .env, so real-user data was not requested." }

  const records: CruxRecord[] = []
  const originCache = new Map<string, Query>()
  let blocked: string | null = null

  for (const url of [...new Set(urls)]) {
    for (const device of DEVICES) {
      let scope: CruxRecord["scope"] = "url"
      let res = await query(key, { url }, device.api)

      if (res.status === 403 || (res.status === 400 && /API_KEY|KEY_/i.test(res.reason))) {
        blocked =
          res.reason === "API_KEY_SERVICE_BLOCKED"
            ? "The CrUX API rejected the key (API_KEY_SERVICE_BLOCKED). Enable the Chrome UX Report API on the key's Google Cloud project and allow it in the key's API restrictions."
            : `The CrUX API refused the request (${res.status} ${res.reason || "error"}). Check CRUX_API_KEY.`
        return { records, unavailable: blocked }
      }

      // no data for this exact page (low traffic): fall back to the whole site
      if (res.status === 404) {
        scope = "origin"
        const cacheKey = `${origin}|${device.api}`
        if (!originCache.has(cacheKey)) originCache.set(cacheKey, await query(key, { origin }, device.api))
        res = originCache.get(cacheKey)!
      }
      if (res.status === 429) return { records, unavailable: "The CrUX API rate limit was reached. Real-user data was only partly collected." }
      if (res.status !== 200 || !res.body?.record?.metrics) continue

      const m = res.body.record.metrics
      records.push({
        url,
        scope,
        device: device.name,
        lcp: metric(m.largest_contentful_paint),
        inp: metric(m.interaction_to_next_paint),
        cls: metric(m.cumulative_layout_shift),
        fcp: metric(m.first_contentful_paint),
        ttfb: metric(m.experimental_time_to_first_byte),
      })
    }
  }

  return { records, unavailable: records.length === 0 ? "Chrome has not collected enough real-user visits to this site yet, so Google has no field data for it." : null }
}
