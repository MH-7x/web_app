import type { RawExtract } from "@/lib/audit/extract"
import type { Hop } from "@/lib/audit/net"
import type { RobotsRules } from "@/lib/audit/robots"
import type { CrawlError, CrawlErrorKind } from "@/lib/audit/types"

/** Raw crawl output, before any checks run. Lives in memory during an audit; only a summary is stored. */

export type CrawledPage = {
  /** final URL after redirects, normalised */
  url: string
  requestedUrl: string
  path: string
  status: number
  redirectChain: Hop[]
  headers: Record<string, string>
  /** null when the response was not an HTML page */
  raw: RawExtract | null
  /** MinHash of the main text, for near-duplicate detection */
  minhash: number[] | null
  inSitemap: boolean
  /** number of pages crawled that link here (filled in after the crawl) */
  inlinks: number
  /** clicks from the homepage over the crawled link graph (filled in after the crawl) */
  depth: number | null
}

export type LinkCheck = {
  status: number
  kind: CrawlErrorKind | null
  message: string
  internal: boolean
  hops: Hop[]
  sources: { page: string; text: string }[]
}

export type SitemapData = {
  url: string
  status: number
  valid: boolean
  declaredBroken: boolean
  /** every URL listed (capped), normalised */
  urls: string[]
  urlCount: number
  children: number
}

export type ImageProbe = { url: string; status: number; type: string; size: number | null; width: number | null; height: number | null; format: string | null }

export type SiteProbes = {
  httpRedirect: { url: string; finalUrl: string; finalStatus: number; hops: Hop[]; error: string | null } | null
  hostVariants: { label: string; url: string; finalUrl: string; finalStatus: number; hops: Hop[]; error: string | null }[]
  notFound: { url: string; status: number; title: string; looksLikeError: boolean; error: string | null } | null
  homeHeaders: Record<string, string> | null
  dns: { ip: string | null; ns: string[]; spf: string | null; dmarc: string | null; mx: number; domain: string; error: string | null } | null
  images: Record<string, ImageProbe>
  ogImages: Record<string, ImageProbe>
}

export type CrawlResult = {
  origin: string
  startUrl: string
  pages: CrawledPage[]
  /** more pages were discoverable than the budget allowed */
  truncated: boolean
  attempted: number
  linkChecks: Record<string, LinkCheck>
  robots: { status: number; text: string; rules: RobotsRules } | null
  llms: { url: string; status: number; ok: boolean } | null
  sitemap: SitemapData | null
  probes: SiteProbes
  errors: CrawlError[]
  /** internal link spellings seen, to find trailing-slash / www / http inconsistencies */
  linkVariants: { key: string; forms: string[] }[]
  /** discovered internal URLs with query strings (not crawled) */
  paramUrls: string[]
  blocked: boolean
}
