import dns from "node:dns/promises"

import type { CrawledPage, ImageProbe, SiteProbes } from "@/lib/audit/crawl-types"
import { parseImageSize } from "@/lib/audit/imageinfo"
import { fetchPrefix, safeFetch, traceRedirects } from "@/lib/audit/net"

/** Site-wide probes that do not belong to any one page: redirects, 404 behaviour, DNS and image files. */

const SECOND_LEVEL = /^(co|com|net|org|gov|ac|edu|sch)\.[a-z]{2}$/

/** example.com for www.example.com, example.co.ae for shop.example.co.ae. */
export function apexOf(host: string) {
  const parts = host.replace(/^www\./i, "").toLowerCase().split(".")
  if (parts.length <= 2) return parts.join(".")
  const last2 = parts.slice(-2).join(".")
  return SECOND_LEVEL.test(last2) ? parts.slice(-3).join(".") : last2
}

async function probeImage(url: string): Promise<ImageProbe> {
  const r = await fetchPrefix(url, 65_536)
  if (!r) return { url, status: 0, type: "", size: null, width: null, height: null, format: null }
  const dims = r.status < 400 ? parseImageSize(r.data) : null
  return {
    url,
    status: r.status,
    type: r.type,
    size: r.size,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    format: dims?.format ?? (/avif/i.test(r.type) ? "avif" : null),
  }
}

async function probeMany(urls: string[], concurrency = 8) {
  const out: Record<string, ImageProbe> = {}
  let next = 0
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < urls.length) {
        const u = urls[next++]
        out[u] = await probeImage(u)
      }
    })
  )
  return out
}

const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => {
  try {
    return await fn()
  } catch {
    return null
  }
}

async function dnsInfo(host: string): Promise<SiteProbes["dns"]> {
  const domain = apexOf(host)
  const [a, ns, txt, dmarc, mx] = await Promise.all([
    safe(() => dns.lookup(host)),
    safe(() => dns.resolveNs(domain)),
    safe(() => dns.resolveTxt(domain)),
    safe(() => dns.resolveTxt(`_dmarc.${domain}`)),
    safe(() => dns.resolveMx(domain)),
  ])
  const flat = (rows: string[][] | null) => (rows ?? []).map((r) => r.join(""))
  return {
    ip: a?.address ?? null,
    ns: ns ?? [],
    spf: flat(txt).find((t) => /^v=spf1/i.test(t)) ?? null,
    dmarc: flat(dmarc).find((t) => /^v=DMARC1/i.test(t)) ?? null,
    mx: mx?.length ?? 0,
    domain,
    error: a || ns ? null : "DNS lookups failed",
  }
}

const absolute = (u: string) => (/^https?:\/\//i.test(u) ? u.split("#")[0] : null)

export async function runProbes(input: { origin: string; startUrl: string; pages: CrawledPage[]; onProgress: (p: { phase: string; message: string; done: number; total: number }) => void }): Promise<SiteProbes> {
  const { origin, pages } = input
  const host = new URL(origin).hostname
  const isHttps = origin.startsWith("https://")

  // one redirect trace per question we want answered
  const alt = host.startsWith("www.") ? host.slice(4) : `www.${host}`
  const sample = pages.find((p) => p.path.length > 1 && !p.path.includes("?") && p.status === 200)
  const traces = await Promise.all([
    isHttps ? traceRedirects(`http://${host}/`) : Promise.resolve(null),
    traceRedirects(`${new URL(origin).protocol}//${alt}/`),
    sample ? traceRedirects(origin + (sample.path.endsWith("/") ? sample.path.slice(0, -1) : sample.path + "/")) : Promise.resolve(null),
  ])
  const [httpTrace, altTrace, slashTrace] = traces
  const mapTrace = (label: string, url: string, t: Awaited<ReturnType<typeof traceRedirects>>) => ({ label, url, finalUrl: t.finalUrl, finalStatus: t.finalStatus, hops: t.hops, error: t.error?.message ?? null })

  // a path that cannot exist: it must answer 404, not 200 with a friendly "not found" page
  const nf = `${origin}/seo-audit-check-${Math.random().toString(36).slice(2, 10)}`
  const notFoundRes = await safe(async () => {
    const res = await safeFetch(nf, { timeoutMs: 10_000 })
    const html = (await res.text()).slice(0, 40_000)
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? ""
    return { url: nf, status: res.status, title, looksLikeError: /not found|404|page (does not|doesn'?t) exist|الصفحة غير موجودة|غير موجود/i.test(`${title} ${html.slice(0, 3000)}`), error: null as string | null }
  })

  const homePage = pages.find((p) => p.url === input.startUrl) ?? pages[0]

  // image files: size and format for a sample, plus every social-share image
  const imageUrls = [...new Set(pages.flatMap((p) => (p.raw?.images ?? []).map((i) => absolute(i.src)).filter((u): u is string => Boolean(u))))].slice(0, 100)
  const ogUrls = [...new Set(pages.map((p) => p.raw?.og["og:image"]).filter((u): u is string => Boolean(u && absolute(u))))].slice(0, 20)

  const [dnsRes, images, ogImages] = await Promise.all([dnsInfo(host), probeMany(imageUrls), probeMany(ogUrls, 4)])

  return {
    httpRedirect: httpTrace ? { url: `http://${host}/`, finalUrl: httpTrace.finalUrl, finalStatus: httpTrace.finalStatus, hops: httpTrace.hops, error: httpTrace.error?.message ?? null } : null,
    hostVariants: [
      mapTrace(host.startsWith("www.") ? "non-www" : "www", `${new URL(origin).protocol}//${alt}/`, altTrace!),
      ...(slashTrace && sample ? [mapTrace("trailing slash", origin + (sample.path.endsWith("/") ? sample.path.slice(0, -1) : sample.path + "/"), slashTrace)] : []),
    ],
    notFound: notFoundRes ?? { url: nf, status: 0, title: "", looksLikeError: false, error: "Could not request a non-existent page" },
    homeHeaders: homePage?.headers ?? null,
    dns: dnsRes,
    images,
    ogImages,
  }
}
