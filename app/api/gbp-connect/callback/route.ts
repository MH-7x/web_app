import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { GbpApiError, handleCallback, originOf } from "@/lib/gbp-api"

const NONCE_COOKIE = "gbp_oauth_nonce"

/** Where Google sends the user after the consent screen. Saves the connection, then returns to the client's settings tab. */
export async function GET(request: Request) {
  const origin = originOf(request)
  const params = new URL(request.url).searchParams
  const [clientId, nonce] = (params.get("state") ?? "").split(".")
  const back = (query: Record<string, string>) => {
    const response = NextResponse.redirect(`${origin}${clientId ? `/clients/${clientId}` : "/clients"}?${new URLSearchParams({ tab: "settings", ...query })}`)
    response.cookies.delete({ name: NONCE_COOKIE, path: "/api/gbp-connect" })
    return response
  }

  const jar = await cookies()
  if (!clientId || !nonce || jar.get(NONCE_COOKIE)?.value !== nonce) return back({ gbp: "error", message: "The sign-in session expired. Start the connection again." })
  if (params.get("error")) return back({ gbp: "error", message: params.get("error") === "access_denied" ? "Google access was not granted." : `Google returned: ${params.get("error")}` })
  const code = params.get("code")
  if (!code) return back({ gbp: "error", message: "Google did not send an authorization code." })

  try {
    await handleCallback(code, clientId, origin)
    return back({ gbp: "connected" })
  } catch (error) {
    if (!(error instanceof GbpApiError)) console.error("[gbp-connect/callback]", error)
    return back({ gbp: "error", message: error instanceof GbpApiError ? error.message : "Something went wrong while connecting. Please try again." })
  }
}
