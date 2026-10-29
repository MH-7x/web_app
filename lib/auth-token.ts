/**
 * The JWT half of auth: only `jose`, no database and no `next/headers`, so proxy.ts can import it too.
 * Everything that reads the cookie jar or the database lives in lib/auth.ts.
 */
import { jwtVerify, SignJWT, type JWTPayload } from "jose"

export const SESSION_COOKIE = "session"

export type SessionClaims = { userId: string; email: string; role: string }

const DAY = 24 * 60 * 60
/** A token with less than this left is swapped for a fresh one by proxy.ts. */
export const REFRESH_WITHIN_SECONDS = 60 * 60
const REMEMBER_SECONDS = 30 * DAY

function secretKey() {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET is missing or too short. Add one to .env: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
  }
  return new TextEncoder().encode(secret)
}

/** A login token: 30 days with "remember me", otherwise 24 hours. `rm` remembers the choice so a refresh keeps it. */
export function signToken(payload: SessionClaims, rememberMe: boolean) {
  return new SignJWT({ ...payload, purpose: "session", rm: rememberMe })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(rememberMe ? "30d" : "24h")
    .sign(secretKey())
}

/** The payload of any token we signed, or null if it is expired, tampered with or malformed. */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  const key = secretKey() // outside the try: a missing secret is a server fault, not a bad token
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] })
    return payload
  } catch {
    return null
  }
}

export type VerifiedSession = SessionClaims & { rememberMe: boolean; exp: number }

/** Like verifyToken, but only accepts a login token. A password-reset token must never work as a session. */
export async function verifySessionToken(token: string): Promise<VerifiedSession | null> {
  const p = await verifyToken(token)
  if (!p || p.purpose !== "session") return null
  if (typeof p.userId !== "string" || typeof p.email !== "string" || typeof p.role !== "string" || typeof p.exp !== "number") return null
  return { userId: p.userId, email: p.email, role: p.role, rememberMe: p.rm === true, exp: p.exp }
}

/**
 * A 10-minute token proving the security answer was right. `pv` is the tail of the current password hash, so the
 * token stops working the moment the password changes (it can be used once).
 */
export function signResetToken(payload: { userId: string; email: string; pv: string }) {
  return new SignJWT({ ...payload, purpose: "reset" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secretKey())
}

export async function verifyResetToken(token: string): Promise<{ userId: string; email: string; pv: string } | null> {
  const p = await verifyToken(token)
  if (!p || p.purpose !== "reset") return null
  if (typeof p.userId !== "string" || typeof p.email !== "string" || typeof p.pv !== "string") return null
  return { userId: p.userId, email: p.email, pv: p.pv }
}

/**
 * httpOnly keeps the token away from scripts. SameSite is "lax", not "strict": a strict cookie is withheld when Google
 * redirects back to /api/gbp-connect/callback, which would break connecting a Business Profile. Lax still keeps the
 * cookie off cross-site POST/PUT/DELETE, and every state-changing route here uses one of those.
 * Without "remember me" there is no maxAge, so it is a browser-session cookie.
 */
export function sessionCookieOptions(rememberMe: boolean) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: rememberMe ? REMEMBER_SECONDS : undefined,
  }
}

/** Pages anyone may open. proxy.ts and the root layout both read this. */
export const PUBLIC_PAGES = ["/login", "/setup"]

/** API routes that work without a session. Exact paths, not prefixes. */
export const PUBLIC_API_ROUTES = ["/api/auth/login", "/api/auth/logout", "/api/auth/setup", "/api/auth/reset-password"]

/** Folders in /public that are served as-is. The trailing slash matters: "/proposal" would also match the /proposals pages. */
export const PUBLIC_FILE_PREFIXES = ["/_next/", "/proposal/"]
export const PUBLIC_FILES = ["/favicon.ico", "/file.svg", "/globe.svg", "/next.svg", "/vercel.svg", "/window.svg"]

export function isPublicPage(pathname: string) {
  return PUBLIC_PAGES.includes(pathname)
}
