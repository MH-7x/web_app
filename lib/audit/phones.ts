/** UAE phone number validation and extraction. Unlike a loose "looks like a number" check, this rejects numbers that cannot exist in the UAE. */

export type PhoneKind = "mobile" | "landline" | "tollfree" | "foreign" | "invalid"

export type PhoneInfo = {
  raw: string
  /** +971XXXXXXXXX for valid UAE numbers, otherwise null */
  e164: string | null
  valid: boolean
  kind: PhoneKind
  reason?: string
}

// UAE mobile prefixes after the country code: 50, 52, 54, 55, 56, 58
const MOBILE = /^5[024568]\d{7}$/
// landline area codes: 2 Abu Dhabi, 3 Al Ain, 4 Dubai, 6 Sharjah/Ajman/UAQ, 7 Ras Al Khaimah, 9 Fujairah
const LANDLINE = /^[234679]\d{7}$/
const TOLLFREE = /^(800\d{2,9}|600\d{6})$/

export function digitsOnly(s: string) {
  return s.replace(/\D/g, "")
}

export function validateUaePhone(raw: string): PhoneInfo {
  const trimmed = raw.trim()
  let digits = digitsOnly(trimmed)
  const international = trimmed.startsWith("+") || digits.startsWith("00")
  if (digits.startsWith("00")) digits = digits.slice(2)

  if (international || digits.startsWith("971")) {
    if (!digits.startsWith("971")) {
      return { raw, e164: null, valid: false, kind: "foreign", reason: `+${digits.slice(0, 3)} is not the UAE country code (+971)` }
    }
    digits = digits.slice(3)
  }
  // a trunk prefix 0 may follow the country code or start a local number
  if (digits.startsWith("0")) digits = digits.slice(1)

  if (MOBILE.test(digits)) return { raw, e164: `+971${digits}`, valid: true, kind: "mobile" }
  if (LANDLINE.test(digits)) return { raw, e164: `+971${digits}`, valid: true, kind: "landline" }
  if (TOLLFREE.test(digits)) return { raw, e164: `+971${digits}`, valid: true, kind: "tollfree" }

  let reason = "not a valid UAE number"
  if (digits.length === 9 && digits.startsWith("5")) reason = `${digits.slice(0, 2)} is not a UAE mobile prefix (valid: 50, 52, 54, 55, 56, 58)`
  else if (digits.length === 8) reason = `${digits[0]} is not a UAE landline area code`
  else if (digits.length < 8) reason = "too short for a UAE number"
  else if (digits.length > 9) reason = "too long for a UAE number"
  return { raw, e164: null, valid: false, kind: "invalid", reason }
}

const CANDIDATE = /(?:\+|00)\s?\d[\d\s().-]{7,16}\d|\b0(?:5\d|[234679])[\s.-]?\d{3}[\s.-]?\d{3,4}\b|\b800[\s-]?\d{2,9}\b/g

/** Phone-like strings in visible text. Deliberately narrow (international prefix, or a UAE local pattern) to avoid dates and IDs. */
export function extractPhones(text: string): string[] {
  const found = new Map<string, string>()
  for (const m of text.matchAll(CANDIDATE)) {
    const raw = m[0].trim()
    const key = digitsOnly(raw)
    if (key.length >= 7 && !found.has(key)) found.set(key, raw)
  }
  return [...found.values()]
}

/** Normalise any phone string to a comparable key: the E.164 form when it is a valid UAE number, otherwise bare digits. */
export function phoneKey(raw: string) {
  const info = validateUaePhone(raw)
  return info.e164 ?? digitsOnly(raw)
}

export function formatE164(e164: string) {
  const n = e164.replace("+971", "")
  return n.length === 9 ? `+971 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}` : `+971 ${n}`
}
