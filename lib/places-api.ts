import { GbpApiError } from "@/lib/gbp-api"
import type { PlaceResult } from "@/lib/reviews-types"

/** Google Places API (New) calls for finding a business and checking its Place ID. Server only: it reads the API key. */

const PLACES_URL = "https://places.googleapis.com/v1"
const TIMEOUT_MS = 15_000

/** A failed Places call, with a message safe to show in the UI. Handled like any other Google error by the API routes. */
export class PlacesApiError extends GbpApiError {}

/** The key for Places calls: a Maps Platform key if one is set, otherwise the Gemini key (it works only if Places API (New) is enabled on its project). */
function apiKey() {
  const key = (process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || process.env.GEMINI_API_KEY || "").trim()
  if (!key) throw new PlacesApiError("No Google API key is set. Add GOOGLE_MAPS_API_KEY to your .env file and restart the server.", 500)
  return key
}

type PlacesErrorBody = { error?: { code?: number; message?: string; status?: string } }

async function places<T>(path: string, fieldMask: string, init: { method: "GET" } | { method: "POST"; body: unknown }): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${PLACES_URL}${path}`, {
      method: init.method,
      headers: {
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": fieldMask,
        ...(init.method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: init.method === "POST" ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
  } catch {
    throw new PlacesApiError("Could not reach Google. Check your connection and try again.", 503)
  }

  if (res.ok) return (await res.json()) as T

  const body = (await res.json().catch(() => null)) as PlacesErrorBody | null
  const detail = body?.error?.message ?? `status ${res.status}`
  console.error(`[places] ${res.status} ${path.split("?")[0]}: ${detail}`)
  if (res.status === 404) throw new PlacesApiError("Google could not find that place. The Place ID may be wrong or out of date: search for the business again in the client form.", 404)
  if (res.status === 400) throw new PlacesApiError(`Google rejected the request: ${detail}`, 400)
  if (res.status === 429) throw new PlacesApiError("Google is rate limiting Places requests. Wait a moment and try again.", 429)
  if (res.status === 401 || res.status === 403) {
    throw new PlacesApiError(
      "Google refused the Places request. Enable “Places API (New)” on the Google Cloud project that owns the key, and set GOOGLE_MAPS_API_KEY in .env (a Gemini-only key usually can't call Places).",
      502
    )
  }
  throw new PlacesApiError(`Google Places failed (${res.status}).`, 502)
}

/* ------------------------------------------------------------------ search */

type RawPlace = { id?: string; displayName?: { text?: string }; formattedAddress?: string; rating?: number; userRatingCount?: number }

/** Text search for a business, e.g. "Al Afnan Furniture Transfer Sharjah". Used by the client form to find the Place ID. */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const data = await places<{ places?: RawPlace[] }>(
    "/places:searchText",
    "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
    { method: "POST", body: { textQuery: query, regionCode: "AE", languageCode: "en", pageSize: 6 } }
  )
  return (data.places ?? []).flatMap((p) =>
    p.id ? [{ placeId: p.id, name: p.displayName?.text ?? "", address: p.formattedAddress ?? "", rating: p.rating ?? null, reviewCount: p.userRatingCount ?? null }] : []
  )
}

/** One place by its ID, so a pasted Place ID can be checked against the business it points to. */
export async function getPlace(placeId: string): Promise<PlaceResult> {
  const p = await places<RawPlace>(`/places/${encodeURIComponent(placeId)}`, "id,displayName,formattedAddress,rating,userRatingCount", { method: "GET" })
  return { placeId: p.id ?? placeId, name: p.displayName?.text ?? "", address: p.formattedAddress ?? "", rating: p.rating ?? null, reviewCount: p.userRatingCount ?? null }
}
