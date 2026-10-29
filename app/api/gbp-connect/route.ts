import { randomBytes } from "node:crypto"

import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { BadRequestError } from "@/lib/content-types"
import { disconnect, getAuthUrl, getConnectionSummary, handleCallback, originOf } from "@/lib/gbp-api"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { getSession } from "@/lib/auth"

// route files may only export handlers, so the callback route repeats this name
const OAUTH_NONCE_COOKIE = "gbp_oauth_nonce"

async function requireClient(clientId: string | null) {
  if (!clientId) throw new BadRequestError("Missing clientId.")
  if (!(await db.client.findUnique({ where: { id: clientId }, select: { id: true } }))) throw new BadRequestError("That client no longer exists.")
  return clientId
}

/**
 * Start connecting a client's Google Business Profile. Returns `{ url }`, the Google consent screen to send the user to.
 * With `?redirect=1` it redirects there directly, so a plain link can start the flow.
 * `?clientId=…&status=1` returns the connection status instead.
 */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const params = new URL(request.url).searchParams
    const clientId = await requireClient(params.get("clientId"))
    if (params.get("status")) return NextResponse.json(await getConnectionSummary(clientId))

    // state = the client id plus a random nonce that is also kept in a cookie, so only a flow started here can finish here
    const nonce = randomBytes(16).toString("hex")
    const url = getAuthUrl(`${clientId}.${nonce}`, originOf(request))
    const response = params.get("redirect") ? NextResponse.redirect(url) : NextResponse.json({ url })
    response.cookies.set(OAUTH_NONCE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", path: "/api/gbp-connect", maxAge: 600, secure: process.env.NODE_ENV === "production" })
    return response
  } catch (error) {
    return handleError(error, "gbp-connect/start")
  }
}

/** Finish the connection from a script or the UI: `{ clientId, code }`. The browser flow uses /callback instead. */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const b = await readJson(request)
    const clientId = await requireClient(typeof b.clientId === "string" ? b.clientId : null)
    if (typeof b.code !== "string" || !b.code) throw new BadRequestError("Missing authorization code.")
    const connection = await handleCallback(b.code, clientId, originOf(request))
    return NextResponse.json({ connected: true, locationName: connection.locationName, connectedAt: connection.connectedAt })
  } catch (error) {
    return handleError(error, "gbp-connect/post")
  }
}

/** Disconnect a client's Google Business Profile. */
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const clientId = new URL(request.url).searchParams.get("clientId")
    if (!clientId) return fail("Missing clientId.", 400)
    await disconnect(clientId)
    return NextResponse.json({ connected: false })
  } catch (error) {
    return handleError(error, "gbp-connect/delete")
  }
}
