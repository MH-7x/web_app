import { DEFAULT_CATEGORY, EMIRATES, isCategory, type ClientCategory } from "@/lib/constants"

export type ClientInput = {
  category: ClientCategory
  name: string
  nameAr: string
  emirate: string
  emiratesServed: string[] // other emirates served, never includes the primary one
  website: string
  phone: string // local part, e.g. "50 123 4567"
  whatsapp: string
  areas: string[]
  services: string[]
  primaryColor: string
  secondaryColor: string
  truckType: string
  uniform: string
  tones: string[]
  notes: string
  initialSetup: string[]
}

export type FieldErrors = Partial<Record<keyof ClientInput, string>>

export const EMPTY_CLIENT: ClientInput = {
  category: DEFAULT_CATEGORY,
  name: "",
  nameAr: "",
  emirate: "",
  emiratesServed: [],
  website: "",
  phone: "",
  whatsapp: "",
  areas: [],
  services: [],
  primaryColor: "#0f766e",
  secondaryColor: "#e2e8f0",
  truckType: "",
  uniform: "",
  tones: [],
  notes: "",
  initialSetup: [],
}

export const STEP_FIELDS: (keyof ClientInput)[][] = [
  ["category", "name", "nameAr", "emirate", "emiratesServed", "website", "phone", "whatsapp", "areas", "services"],
  ["primaryColor", "secondaryColor"],
  [],
]

const ARABIC = /[؀-ۿ]/
const HEX = /^#[0-9a-fA-F]{6}$/

/** Strip everything but digits, drop a leading +971 / 971 / 0, return the national number. */
export function normalizeUaeNumber(raw: string) {
  let digits = raw.replace(/\D/g, "")
  if (digits.startsWith("00971")) digits = digits.slice(5)
  else if (digits.startsWith("971")) digits = digits.slice(3)
  if (digits.startsWith("0")) digits = digits.slice(1)
  return digits
}

export function toE164(raw: string) {
  const national = normalizeUaeNumber(raw)
  return national ? `+971${national}` : ""
}

export function formatPhone(e164: string) {
  const national = normalizeUaeNumber(e164)
  if (national.length < 8) return e164
  return `+971 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`
}

export function normalizeWebsite(raw: string) {
  const value = raw.trim()
  if (!value) return ""
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

export function displayDomain(url: string | null | undefined) {
  if (!url) return ""
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "")
}

export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "client"
  )
}

export function validateClient(input: ClientInput, fields?: (keyof ClientInput)[]): FieldErrors {
  const errors: FieldErrors = {}
  const check = (key: keyof ClientInput, message: string | null) => {
    if (message && (!fields || fields.includes(key))) errors[key] = message
  }

  check("category", !isCategory(input.category) ? "Choose a business category." : null)
  check("name", input.name.trim().length < 2 ? "Enter the English company name." : null)
  check(
    "nameAr",
    !input.nameAr.trim()
      ? "Enter the Arabic company name."
      : !ARABIC.test(input.nameAr)
        ? "Use Arabic script for this field."
        : null
  )
  check("emirate", !(EMIRATES as readonly string[]).includes(input.emirate) ? "Select the primary emirate." : null)

  check(
    "emiratesServed",
    input.emiratesServed.some((e) => !(EMIRATES as readonly string[]).includes(e)) ? "Choose emirates from the list." : null
  )

  const website = input.website.trim()
  let websiteError: string | null = null
  if (website) {
    try {
      const url = new URL(normalizeWebsite(website))
      if (!url.hostname.includes(".")) websiteError = "Enter a valid website URL."
    } catch {
      websiteError = "Enter a valid website URL."
    }
  }
  check("website", websiteError)

  const phone = normalizeUaeNumber(input.phone)
  check("phone", phone.length < 8 || phone.length > 9 ? "Enter a valid UAE number (e.g. 50 123 4567)." : null)
  const whatsapp = normalizeUaeNumber(input.whatsapp)
  check("whatsapp", whatsapp.length < 8 || whatsapp.length > 9 ? "Enter a valid WhatsApp number." : null)

  check("services", input.services.length === 0 ? "Select at least one service." : null)
  check("primaryColor", !HEX.test(input.primaryColor) ? "Use a hex color like #0f766e." : null)
  check("secondaryColor", !HEX.test(input.secondaryColor) ? "Use a hex color like #e2e8f0." : null)

  return errors
}

/** Plain JSON-column values -> typed arrays/objects. */
export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
