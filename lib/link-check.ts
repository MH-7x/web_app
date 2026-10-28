import { classifyFetchError, safeFetch } from "@/lib/audit/net"

/** Checks whether a backlink's page still loads. Server only: it fetches the page, refusing anything that isn't a public website. */

export type LinkCheck = {
  /** live: the page loads; dead: gone or unreachable; unknown: the site blocked or timed out, so nothing was proven */
  state: "live" | "dead" | "unknown"
  message: string
  /** whether the client's website address appears in the page's HTML; null when it wasn't checked. Pages built in the browser (Medium, Quora...) can say false while the link is there. */
  mentionsSite: boolean | null
}

const MAX_BYTES = 1_000_000
// some sites refuse requests that don't look like a browser
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; CitationLinkChecker/1.0)", Accept: "text/html,application/xhtml+xml" }

const hostOf = (url: string) => {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, "").toLowerCase()
  } catch {
    return ""
  }
}

/** The first MAX_BYTES of the body as text, so a huge page isn't downloaded whole. */
async function readCapped(res: Response) {
  const reader = res.body?.getReader()
  if (!reader) return ""
  const decoder = new TextDecoder()
  let text = ""
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    text += decoder.decode(value, { stream: true })
  }
  await reader.cancel().catch(() => {})
  return text
}

export async function checkLink(linkUrl: string, clientWebsite: string | null): Promise<LinkCheck> {
  try {
    const res = await safeFetch(linkUrl, { method: "GET", headers: HEADERS, timeoutMs: 10_000 })
    if (res.status === 404 || res.status === 410) {
      await res.body?.cancel().catch(() => {})
      return { state: "dead", message: `The page is gone (${res.status}).`, mentionsSite: null }
    }
    if (res.ok) {
      const site = clientWebsite ? hostOf(clientWebsite) : ""
      const mentionsSite = site ? (await readCapped(res)).toLowerCase().includes(site) : null
      await res.body?.cancel().catch(() => {})
      return {
        state: "live",
        message: mentionsSite === false ? "The page loads, but the client's website address wasn't found in it. Open it to check the link is there." : "The page loads.",
        mentionsSite,
      }
    }
    await res.body?.cancel().catch(() => {})
    return { state: "unknown", message: `The site answered ${res.status}, so the link couldn't be checked. Open it to check by hand.`, mentionsSite: null }
  } catch (error) {
    const { kind, message } = classifyFetchError(error)
    // a domain that no longer resolves is gone for good; a timeout or refused connection may be temporary
    if (kind === "dns") return { state: "dead", message, mentionsSite: null }
    return { state: "unknown", message: `${message}. Open the link to check by hand.`, mentionsSite: null }
  }
}
