import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

/** Guards so the audit only ever talks to public websites, never to the machine's own network. */

function isPrivateIPv4(ip: string) {
  const [a, b, c] = ip.split(".").map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // protocol assignments and TEST-NET-1 only; the rest of 192.0.x.x is public
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  )
}

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIPv4(ip)
  const v6 = ip.toLowerCase()
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6)
  if (mapped) return isPrivateIPv4(mapped[1])
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || /^fe[89ab]/.test(v6)
}

const hostCache = new Map<string, boolean>()

/**
 * True when the host resolves only to public addresses. A verdict is cached per host, but a failed DNS lookup is not:
 * a single network hiccup must not mark a real website as "not public" until the server restarts.
 */
export async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^[|]$/g, "").toLowerCase()
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false
  const cached = hostCache.get(host)
  if (cached !== undefined) return cached

  let addresses: { address: string }[] = []
  if (isIP(host)) addresses = [{ address: host }]
  else {
    for (let attempt = 0; attempt < 2 && !addresses.length; attempt++) {
      try {
        addresses = await lookup(host, { all: true })
      } catch {
        // retry once, then give up without caching
      }
    }
  }
  if (!addresses.length) return false

  const ok = !addresses.some((a) => isPrivateAddress(a.address))
  hostCache.set(host, ok)
  if (hostCache.size > 500) hostCache.delete(hostCache.keys().next().value!)
  return ok
}

export async function assertPublicUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("That is not a valid website address.")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) websites can be audited.")
  if (!(await isPublicHost(url.hostname))) throw new Error("That address is not a public website, or its domain name could not be resolved.")
  return url
}

/** fetch with a timeout that refuses non-public hosts (also on redirects). */
export async function safeFetch(raw: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 8_000, ...rest } = init
  let url = await assertPublicUrl(raw)
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, { ...rest, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) })
    const location = res.headers.get("location")
    if (res.status >= 300 && res.status < 400 && location) {
      url = await assertPublicUrl(new URL(location, url).toString())
      continue
    }
    return res
  }
  throw new Error("Too many redirects.")
}

/* ------------------------------------------------------------------ errors */

import type { CrawlErrorKind } from "@/lib/audit/types"

/** Sort a failed request into a kind a person can act on: DNS problem, timeout, refused connection, bot block... */
export function classifyFetchError(error: unknown): { kind: CrawlErrorKind; message: string } {
  const e = error as { name?: string; message?: string; cause?: { code?: string; message?: string } }
  const code = e?.cause?.code ?? ""
  const message = e?.cause?.message || e?.message || "Request failed"
  if (e?.name === "TimeoutError" || e?.name === "AbortError" || code === "UND_ERR_CONNECT_TIMEOUT") return { kind: "timeout", message: "The request timed out" }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || /dns|getaddrinfo/i.test(message)) return { kind: "dns", message: "The domain name could not be resolved (DNS failure)" }
  if (/not a public website|internal addresses/i.test(message)) return { kind: "other", message }
  if (["ECONNREFUSED", "ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(code) || /certificate|ssl|tls/i.test(message)) {
    return { kind: "network", message: /certificate|ssl|tls|CERT_/i.test(`${code} ${message}`) ? `TLS/certificate problem (${code || message})` : `Connection failed (${code || message})` }
  }
  return { kind: "network", message }
}

/* --------------------------------------------------------------- redirects */

export type Hop = { url: string; status: number }

export type RedirectTrace = {
  /** every response on the way, the last one being the final answer */
  hops: Hop[]
  finalUrl: string
  finalStatus: number
  loop: boolean
  headers: Headers | null
  error: { kind: CrawlErrorKind; message: string } | null
}

/** Follow redirects by hand so every hop (and its status) is recorded. Stops at 10 hops or on a loop. */
export async function traceRedirects(raw: string, init: { method?: string; timeoutMs?: number } = {}): Promise<RedirectTrace> {
  const { method = "GET", timeoutMs = 10_000 } = init
  const hops: Hop[] = []
  const seen = new Set<string>()
  let url = raw
  let headers: Headers | null = null
  try {
    for (let i = 0; i < 10; i++) {
      if (seen.has(url)) return { hops, finalUrl: url, finalStatus: hops[hops.length - 1]?.status ?? 0, loop: true, headers, error: null }
      seen.add(url)
      const target = await assertPublicUrl(url)
      let res = await fetch(target, { method, redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "Mozilla/5.0 (compatible; UAEMarketingHubAudit/1.0)" } })
      // plenty of servers refuse HEAD
      if (method === "HEAD" && [403, 405, 501].includes(res.status)) res = await fetch(target, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "Mozilla/5.0 (compatible; UAEMarketingHubAudit/1.0)" } })
      hops.push({ url, status: res.status })
      headers = res.headers
      await res.body?.cancel().catch(() => {})
      const location = res.headers.get("location")
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, target).toString()
        continue
      }
      return { hops, finalUrl: url, finalStatus: res.status, loop: false, headers, error: null }
    }
    return { hops, finalUrl: url, finalStatus: hops[hops.length - 1]?.status ?? 0, loop: true, headers, error: null }
  } catch (e) {
    return { hops, finalUrl: url, finalStatus: 0, loop: false, headers, error: classifyFetchError(e) }
  }
}

/** First `bytes` of a file (for reading image dimensions), plus its total size when the server says. */
export async function fetchPrefix(raw: string, bytes = 65_536): Promise<{ status: number; type: string; size: number | null; data: Uint8Array } | null> {
  try {
    const res = await safeFetch(raw, { method: "GET", headers: { range: `bytes=0-${bytes - 1}`, "user-agent": "Mozilla/5.0 (compatible; UAEMarketingHubAudit/1.0)" }, timeoutMs: 10_000 })
    const total = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1]
    const length = res.headers.get("content-length")
    const size = total ? Number(total) : res.status === 200 && length ? Number(length) : null
    const reader = res.body?.getReader()
    const chunks: Uint8Array[] = []
    let got = 0
    while (reader && got < bytes) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      got += value.byteLength
    }
    await reader?.cancel().catch(() => {})
    // a range request answers 206 (partial content), which is a success for our purposes
    return { status: res.status === 206 ? 200 : res.status, type: res.headers.get("content-type") ?? "", size, data: Buffer.concat(chunks) }
  } catch {
    return null
  }
}
