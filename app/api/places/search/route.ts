import { NextResponse } from "next/server"

import { PLACE_ID_PATTERN } from "@/lib/client-schema"
import { BadRequestError } from "@/lib/content-types"
import { handleError } from "@/lib/gbp-posts-api"
import { getPlace, searchPlaces } from "@/lib/places-api"
import { getSession } from "@/lib/auth"

/**
 * Find a business on Google Maps; the client form uses it and the API key stays on the server.
 * `?q=Al Afnan Sharjah` searches by name and returns `{places}`; `?id=ChIJ…` looks up one Place ID and returns `{place}`.
 */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const params = new URL(request.url).searchParams
    const id = (params.get("id") ?? "").trim()
    if (id) {
      if (!PLACE_ID_PATTERN.test(id)) throw new BadRequestError("That does not look like a Google Place ID.")
      return NextResponse.json({ place: await getPlace(id) })
    }
    const query = (params.get("q") ?? "").trim().slice(0, 200)
    if (query.length < 2) throw new BadRequestError("Enter a business name to search for.")
    return NextResponse.json({ places: await searchPlaces(query) })
  } catch (error) {
    return handleError(error, "places/search")
  }
}
