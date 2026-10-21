import { NextResponse } from "next/server"

import { startAudit } from "@/lib/audit/jobs"
import { assertPublicUrl } from "@/lib/audit/net"
import type { AuditInput } from "@/lib/audit/types"
import { getClient } from "@/lib/clients"
import { BadRequestError } from "@/lib/content-types"
import { handleError, readJson } from "@/lib/gbp-posts-api"

const stripWww = (h: string) => h.replace(/^www\./i, "").toLowerCase()

/** Start an audit of the client's website in the background. Returns the job to poll. */
export async function POST(request: Request) {
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

    const keyword = typeof b.targetKeyword === "string" ? b.targetKeyword.trim().slice(0, 100) : ""
    let targetUrl: string | null = null
    if (typeof b.targetUrl === "string" && b.targetUrl.trim()) {
      let t: URL
      try {
        t = new URL(/^https?:\/\//i.test(b.targetUrl.trim()) ? b.targetUrl.trim() : `https://${b.targetUrl.trim()}`)
      } catch {
        throw new BadRequestError("The target page is not a valid address.")
      }
      if (stripWww(t.hostname) !== stripWww(url.hostname)) throw new BadRequestError("The target page must be on the client's own website.")
      targetUrl = t.toString()
    }
    const input: AuditInput = { targetKeyword: keyword || null, targetUrl }

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
