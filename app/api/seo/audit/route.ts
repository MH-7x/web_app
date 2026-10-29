import { NextResponse } from "next/server"

import { startAudit } from "@/lib/audit/jobs"
import { assertPublicUrl } from "@/lib/audit/net"
import type { AuditInput, KeywordPair } from "@/lib/audit/types"
import { getClient } from "@/lib/clients"
import { BadRequestError } from "@/lib/content-types"
import { handleError, readJson } from "@/lib/gbp-posts-api"
import { getSession } from "@/lib/auth"

const stripWww = (h: string) => h.replace(/^www\./i, "").toLowerCase()

const MAX_PAIRS = 30

/**
 * Rows of {url, keyword} from the form. Blank rows are dropped; a full address must be on the client's own site and is
 * reduced to its path, so the engine matches pages by path whichever way the address was typed.
 */
function parseKeywordPairs(raw: unknown, site: URL): KeywordPair[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new BadRequestError("Pages and keywords must be a list.")
  const pairs: KeywordPair[] = []
  for (const row of raw) {
    const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>
    const keyword = typeof r.keyword === "string" ? r.keyword.trim().slice(0, 100) : ""
    const page = typeof r.url === "string" ? r.url.trim() : ""
    if (!keyword && !page) continue
    if (!keyword) throw new BadRequestError(`Add a keyword for ${page}, or remove that row.`)
    let path = "/"
    if (page) {
      let t: URL
      try {
        // "/services/x" (or "services/x") is a path on the client's site; anything with a domain is read as an address
        const isAddress = /^https?:\/\//i.test(page) || /^[^/\s]+\.[a-z]{2,}(\/|$)/i.test(page)
        t = isAddress ? new URL(/^https?:\/\//i.test(page) ? page : `https://${page}`) : new URL(page.startsWith("/") ? page : `/${page}`, site)
      } catch {
        throw new BadRequestError(`"${page}" is not a valid page address.`)
      }
      if (stripWww(t.hostname) !== stripWww(site.hostname)) throw new BadRequestError(`${page} is not on the client's own website.`)
      path = t.pathname || "/"
    }
    pairs.push({ url: path, keyword })
  }
  if (pairs.length > MAX_PAIRS) throw new BadRequestError(`Check at most ${MAX_PAIRS} pages per audit.`)
  return pairs
}

/** Start an audit of the client's website in the background. Returns the job to poll. */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const b = await readJson(request)
    if (typeof b.clientId !== "string" || !b.clientId) throw new BadRequestError("Select a client first.")
    const client = await getClient(b.clientId)
    if (!client) return NextResponse.json({ error: "That client no longer exists." }, { status: 404 })
    if (!client.website) throw new BadRequestError("This client has no website saved. Add one on the client's profile first.")

    let url: URL
    try {
      url = await assertPublicUrl(client.website)
    } catch (e) {
      throw new BadRequestError(e instanceof Error ? e.message : "That is not a valid website address.")
    }

    const input: AuditInput = { keywordPairs: parseKeywordPairs(b.keywordPairs, url) }

    const job = startAudit(
      client.id,
      url.toString(),
      {
        name: client.name,
        nameAr: client.nameAr,
        phone: client.phone,
        whatsapp: client.whatsapp,
        website: client.website,
        services: client.services,
        areas: client.areas,
        emirate: client.emirate,
        emiratesServed: client.emiratesServed,
      },
      input
    )
    return NextResponse.json({ job })
  } catch (error) {
    return handleError(error, "seo/audit")
  }
}
