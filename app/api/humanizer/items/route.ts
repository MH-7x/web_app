import { NextResponse } from "next/server"

import { CONTENT_MODULE_TYPES, type ContentType } from "@/lib/content-types"
import { fail, handleError } from "@/lib/gbp-posts-api"
import { listBatchItems } from "@/lib/humanizer-store"
import { getSession } from "@/lib/auth"

/** The pieces of a client's saved content that batch mode can humanize. */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const params = new URL(request.url).searchParams
    const clientId = params.get("clientId")
    if (!clientId) return fail("Select a client first.", 400)
    const type = params.get("type") ?? "all"
    if (type !== "all" && !(CONTENT_MODULE_TYPES as string[]).includes(type)) return fail("Unknown content type.", 400)
    return NextResponse.json(await listBatchItems(clientId, type as ContentType | "all"))
  } catch (error) {
    return handleError(error, "humanizer/items")
  }
}
