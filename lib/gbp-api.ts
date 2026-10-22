import { db } from "@/lib/db"
import type { GBPConnection } from "@/lib/generated/prisma/client"
import { addDays, dateKey } from "@/lib/gbp-posts-types"

/** Google OAuth and Business Profile calls. Server only: it reads the client secret and the stored tokens. */

const SCOPE = "https://www.googleapis.com/auth/business.manage"
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
const LOCATIONS_URL = "https://mybusinessbusinessinformation.googleapis.com/v1"
// local posts only exist in the v4 API
const POSTS_URL = "https://mybusiness.googleapis.com/v4"

export const CALLBACK_PATH = "/api/gbp-connect/callback"

/** A failed Google call, with Google's own message so the UI can show something useful. */
export class GbpApiError extends Error {
  constructor(
    message: string,
    readonly status = 502
  ) {
    super(message)
  }
}

/* ------------------------------------------------------------------ config */

function credentials() {
  const id = (process.env.GOOGLE_CLIENT_ID || process.env.OAUTH_CLIENT_ID || "").trim()
  const secret = (process.env.GOOGLE_CLIENT_SECRET || process.env.OAUTH_CLIENT_SECRET || "").trim()
  if (!id || !secret) throw new GbpApiError("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env and restart the server.", 500)
  return { id, secret }
}

/** The redirect URI Google sends people back to. It must be listed under "Authorized redirect URIs" in Google Cloud. */
export const redirectUri = (origin: string) => `${origin}${CALLBACK_PATH}`

/** This app's public origin: APP_URL when set (behind a proxy), otherwise the one the request came in on. */
export const originOf = (request: Request) => (process.env.APP_URL?.trim() || new URL(request.url).origin).replace(/\/$/, "")

/* -------------------------------------------------------------------- auth */

/** The Google consent URL. `state` carries the client id (plus a nonce the caller checks) so the callback knows who is connecting. */
export function getAuthUrl(state: string, origin: string) {
  const params = new URLSearchParams({
    client_id: credentials().id,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPE,
    // offline + consent is what makes Google return a refresh token every time
    access_type: "offline",
    prompt: "consent",
    state,
  })
  return `${AUTH_URL}?${params}`
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }

async function tokenRequest(body: Record<string, string>) {
  const { id, secret } = credentials()
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse
  return { res, data }
}

const expiryFrom = (seconds?: number) => new Date(Date.now() + (seconds ?? 3600) * 1000)

/** Call a Google API with a bearer token and return its JSON, or throw with Google's message. */
async function google<T>(url: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers } })
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } }
  if (!res.ok) {
    const detail = data.error?.message ?? `HTTP ${res.status}`
    if (res.status === 401) throw new GbpApiError("Google rejected the saved login. Disconnect and connect Google Business Profile again.", 401)
    if (res.status === 429) {
      // A new Google Cloud project has a quota of 0 for the Business Profile APIs until Google approves access,
      // which looks like rate limiting but never clears by waiting.
      console.error("[gbp-api] 429 from", url, detail)
      throw new GbpApiError(
        /quota|limit|exhausted/i.test(detail)
          ? `Google refused the request because this Google Cloud project has no Business Profile API quota yet (${detail}). New projects need Google's approval first: submit the "GBP API access" request form, then try again once it is approved.`
          : "Google is rate limiting Business Profile requests. Wait a minute and try again.",
        429
      )
    }
    throw new GbpApiError(`Google said: ${detail}`, res.status === 403 || res.status === 404 ? res.status : 502)
  }
  return data
}

type Account = { name: string; accountName?: string; type?: string }
type Location = { name: string; title?: string }

/** Exchange the auth code for tokens, find the account's first location and save the connection for the client. */
export async function handleCallback(code: string, clientId: string, origin: string) {
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } })
  if (!client) throw new GbpApiError("That client no longer exists.", 404)

  const { res, data } = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) })
  if (!res.ok || !data.access_token) throw new GbpApiError(`Google would not accept the sign-in${data.error_description ? `: ${data.error_description}` : "."} Try connecting again.`, 400)

  const existing = await db.gBPConnection.findUnique({ where: { clientId } })
  const refreshToken = data.refresh_token ?? existing?.refreshToken
  if (!refreshToken) throw new GbpApiError("Google did not return a refresh token. Remove this app under your Google account's third-party access, then connect again.", 400)

  const accounts = (await google<{ accounts?: Account[] }>(ACCOUNTS_URL, data.access_token)).accounts ?? []
  if (!accounts.length) throw new GbpApiError("That Google account has no Business Profile accounts. Sign in with the account that manages the listing.", 400)

  // prefer an account that actually has a location; the personal account is listed first
  let account = accounts[0]
  let location: Location | undefined
  for (const a of accounts) {
    const url = `${LOCATIONS_URL}/${a.name}/locations?readMask=name,title&pageSize=100`
    const found = (await google<{ locations?: Location[] }>(url, data.access_token)).locations ?? []
    if (found.length) {
      account = a
      location = found[0]
      break
    }
  }
  if (!location) throw new GbpApiError("No Business Profile locations were found on that Google account.", 400)

  const values = {
    googleAccountId: account.name, // "accounts/123"
    locationId: location.name, // "locations/456"
    locationName: location.title ?? "",
    accessToken: data.access_token,
    refreshToken,
    tokenExpiry: expiryFrom(data.expires_in),
    connected: true,
  }
  return db.gBPConnection.upsert({ where: { clientId }, create: { clientId, ...values }, update: { ...values, connectedAt: new Date() } })
}

/** Get a fresh access token with the refresh token and save it. */
export async function refreshAccessToken(connection: GBPConnection) {
  const { res, data } = await tokenRequest({ refresh_token: connection.refreshToken, grant_type: "refresh_token" })
  if (!res.ok || !data.access_token) {
    // the user revoked access or the token expired for good: needs a new sign-in
    if (data.error === "invalid_grant") await db.gBPConnection.update({ where: { id: connection.id }, data: { connected: false } })
    throw new GbpApiError("The Google login for this client expired or was revoked. Connect Google Business Profile again.", 401)
  }
  return db.gBPConnection.update({ where: { id: connection.id }, data: { accessToken: data.access_token, tokenExpiry: expiryFrom(data.expires_in) } })
}

/** The connection with a token that is good for at least another minute. */
export async function freshConnection(connection: GBPConnection) {
  return connection.tokenExpiry.getTime() - Date.now() > 60_000 ? connection : refreshAccessToken(connection)
}

/** The connection the UI may see: never the tokens. */
export async function getConnectionSummary(clientId: string) {
  const c = await db.gBPConnection.findUnique({ where: { clientId } })
  return c?.connected ? { connected: true as const, locationName: c.locationName, connectedAt: c.connectedAt } : { connected: false as const }
}

/** Forget the connection. Tokens are revoked at Google first on a best-effort basis. */
export async function disconnect(clientId: string) {
  const c = await db.gBPConnection.findUnique({ where: { clientId } })
  if (!c) return
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(c.refreshToken)}`, { method: "POST" }).catch(() => {})
  await db.gBPConnection.delete({ where: { clientId } })
}

/* -------------------------------------------------------------- publishing */

export type PublishInput = {
  summary: string
  languageCode: "ar" | "en"
  /** the post's own type: whats-new, offer or event */
  postType: string
  /** the post's own CTA: call, learn-more or book */
  cta: string
  /** the client's website, used by Learn more and Book */
  websiteUrl: string | null
  imageUrl: string
  /** a short title, needed by Offer and Event posts */
  title: string
}

const TOPIC_TYPE: Record<string, "STANDARD" | "OFFER" | "EVENT"> = { "whats-new": "STANDARD", offer: "OFFER", event: "EVENT" }
const ACTION_TYPE: Record<string, "CALL" | "LEARN_MORE" | "BOOK"> = { call: "CALL", "learn-more": "LEARN_MORE", book: "BOOK" }

/** The body of the localPosts.create request. */
export function buildLocalPost(post: PublishInput, now = new Date()) {
  const topicType = TOPIC_TYPE[post.postType] ?? "STANDARD"
  const actionType = ACTION_TYPE[post.cta]
  const body: Record<string, unknown> = { languageCode: post.languageCode, summary: post.summary, topicType }

  // Call uses the phone number on the listing, so Google takes no url for it; the other two need a link
  if (actionType === "CALL") body.callToAction = { actionType }
  else if (actionType && post.websiteUrl) body.callToAction = { actionType, url: post.websiteUrl }

  // Offer and Event posts must carry a title and a date range
  if (topicType !== "STANDARD") {
    const today = dateKey(now)
    const date = (key: string) => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), day: Number(key.slice(8, 10)) })
    body.event = { title: post.title.slice(0, 58), schedule: { startDate: date(today), endDate: date(addDays(today, 30)) } }
  }
  if (post.imageUrl) body.media = [{ mediaFormat: "PHOTO", sourceUrl: post.imageUrl }]
  return body
}

/** Create a local post on the connected location. Returns Google's id for it ("accounts/…/locations/…/localPosts/…"). */
export async function publishPost(connection: GBPConnection, post: PublishInput): Promise<{ id: string }> {
  const url = `${POSTS_URL}/${connection.googleAccountId}/${connection.locationId}/localPosts`
  const created = await google<{ name?: string }>(url, connection.accessToken, { method: "POST", body: JSON.stringify(buildLocalPost(post)) })
  if (!created.name) throw new GbpApiError("Google accepted the post but did not return its id.")
  return { id: created.name }
}
