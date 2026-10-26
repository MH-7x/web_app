import type { Ctx } from "@/lib/audit/checks/util"
import { containsPhrase, words } from "@/lib/audit/text"
import type { KeywordCheck, KeywordPair } from "@/lib/audit/types"

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Comparable form of a path or URL: decoded, lowercase, no query, no trailing slash ("/" for the homepage). */
function pathKey(raw: string) {
  let path = raw.trim()
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname
    } catch {
      /* keep as typed */
    }
  }
  path = safeDecode(path.split(/[?#]/)[0]).toLowerCase()
  if (!path.startsWith("/")) path = `/${path}`
  return path.length > 1 ? path.replace(/\/+$/, "") : path
}

/** Look for each pair's keyword in the title, H1, first 100 words, URL and meta description of the crawled page at its path. */
export function checkKeywords(ctx: Ctx, pairs: KeywordPair[]): KeywordCheck[] {
  const byPath = new Map<string, Ctx["html"][number]>()
  // a page reached through a redirect is still "the page at" the path that was asked for
  for (const p of ctx.html) {
    byPath.set(pathKey(p.path), p)
    byPath.set(pathKey(p.requestedUrl), p)
  }

  return pairs.map(({ url, keyword }) => {
    const page = byPath.get(pathKey(url))
    const raw = page?.raw
    if (!page || !raw) return { url, keyword, found: false, inTitle: false, inH1: false, inFirst100: false, inUrl: false, inMeta: false, score: 0 }

    const inTitle = containsPhrase(raw.title, keyword)
    const inH1 = raw.headings.some((h) => h.level === 1 && containsPhrase(h.text, keyword))
    const inFirst100 = containsPhrase(words(raw.mainText).slice(0, 100).join(" "), keyword)
    const inUrl = containsPhrase(safeDecode(page.path.split(/[?#]/)[0]).replace(/[-_/]/g, " "), keyword)
    const inMeta = containsPhrase(raw.metaDescription, keyword)
    return { url, keyword, found: true, inTitle, inH1, inFirst100, inUrl, inMeta, score: [inTitle, inH1, inFirst100, inUrl, inMeta].filter(Boolean).length }
  })
}
