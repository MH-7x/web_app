"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import {
  asOtherLinks,
  asRecord,
  normalizeWebsite,
  slugify,
  toE164,
  validateClient,
  type ClientInput,
  type FieldErrors,
} from "@/lib/client-schema"
import { ACTIVE_CLIENT_COOKIE, DEFAULT_CATEGORY, isCategory } from "@/lib/constants"
import { db } from "@/lib/db"
import { getDefaultChecklist } from "@/lib/onboarding-templates"

export type ActionResult = { ok: false; errors: FieldErrors; message?: string }
export type CreateResult = ActionResult | { ok: true; id: string }

const str = (v: unknown) => (typeof v === "string" ? v : "")
const strList = (v: unknown) =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))]
    : []

/** Server Actions are reachable with arbitrary POST bodies, so never trust the shape. */
function sanitize(raw: unknown): ClientInput {
  const r = asRecord(raw)
  return {
    category: isCategory(r.category) ? r.category : DEFAULT_CATEGORY,
    name: str(r.name).trim(),
    nameAr: str(r.nameAr).trim(),
    emirate: str(r.emirate),
    emiratesServed: strList(r.emiratesServed),
    website: str(r.website).trim(),
    placeId: str(r.placeId).trim(),
    phone: str(r.phone),
    whatsapp: str(r.whatsapp),
    areas: strList(r.areas),
    services: strList(r.services),
    primaryColor: str(r.primaryColor),
    secondaryColor: str(r.secondaryColor),
    truckType: str(r.truckType).trim(),
    uniform: str(r.uniform).trim(),
    tones: strList(r.tones),
    notes: str(r.notes).trim(),
    companyProfile: str(r.companyProfile).trim(),
    initialSetup: strList(r.initialSetup),
    facebookUrl: str(r.facebookUrl).trim(),
    instagramUrl: str(r.instagramUrl).trim(),
    driveLink: str(r.driveLink).trim(),
    otherLinks: asOtherLinks(r.otherLinks).map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
  }
}

async function uniqueSlug(name: string, ignoreId?: string) {
  const base = slugify(name)
  let slug = base
  for (let i = 2; ; i++) {
    const existing = await db.client.findUnique({ where: { slug }, select: { id: true } })
    if (!existing || existing.id === ignoreId) return slug
    slug = `${base}-${i}`
  }
}

function toColumns(input: ClientInput) {
  return {
    category: input.category,
    name: input.name,
    nameAr: input.nameAr,
    emirate: input.emirate,
    // the primary emirate is implied, so never store it twice
    emiratesServed: input.emiratesServed.filter((e) => e !== input.emirate),
    areas: input.areas,
    services: input.services,
    phone: toE164(input.phone),
    whatsapp: toE164(input.whatsapp),
    website: normalizeWebsite(input.website) || null,
    placeId: input.placeId,
    brandColors: { primary: input.primaryColor, secondary: input.secondaryColor },
    tone: input.tones.join(", ") || null,
    notes: input.notes || null,
    companyProfile: input.companyProfile,
    facebookUrl: normalizeWebsite(input.facebookUrl),
    instagramUrl: normalizeWebsite(input.instagramUrl),
    driveLink: normalizeWebsite(input.driveLink),
    otherLinks: input.otherLinks.filter((l) => l.url).map((l) => ({ label: l.label, url: normalizeWebsite(l.url) })),
  }
}

/** With `navigate: false` the client is saved and its id returned, so onboarding can generate content before leaving the page. */
export async function createClientAction(raw: unknown, options: { navigate?: boolean } = {}): Promise<CreateResult> {
  const input = sanitize(raw)
  const errors = validateClient(input)
  if (Object.keys(errors).length) return { ok: false, errors }

  const client = await db.client.create({
    data: {
      ...toColumns(input),
      slug: await uniqueSlug(input.name),
      onboardingChecklist: JSON.stringify(getDefaultChecklist(input.category)),
      brandSpecs: { truckType: input.truckType, uniform: input.uniform, initialSetup: input.initialSetup },
    },
  })

  const jar = await cookies()
  if (!jar.get(ACTIVE_CLIENT_COOKIE)) {
    jar.set(ACTIVE_CLIENT_COOKIE, client.id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
  }
  revalidatePath("/", "layout")
  if (options.navigate === false) return { ok: true, id: client.id }
  redirect(`/clients/${client.id}`)
}

export async function updateClientAction(id: string, raw: unknown, options: { navigate?: boolean } = {}): Promise<CreateResult> {
  const input = sanitize(raw)
  const errors = validateClient(input)
  if (Object.keys(errors).length) return { ok: false, errors }

  const existing = await db.client.findUnique({ where: { id }, select: { brandSpecs: true } })
  if (!existing) return { ok: false, errors: {}, message: "This client no longer exists." }

  await db.client.update({
    where: { id },
    data: {
      ...toColumns(input),
      // keep keys the form does not edit (style, avoid, ...)
      brandSpecs: {
        ...asRecord(existing.brandSpecs),
        truckType: input.truckType,
        uniform: input.uniform,
        initialSetup: input.initialSetup,
      },
    },
  })
  revalidatePath("/", "layout")
  if (options.navigate === false) return { ok: true, id }
  redirect(`/clients/${id}`)
}

export async function deleteClientAction(id: string, redirectTo?: string) {
  await db.client.deleteMany({ where: { id } }) // cascades to GeneratedContent; no throw if already gone
  const jar = await cookies()
  if (jar.get(ACTIVE_CLIENT_COOKIE)?.value === id) jar.delete(ACTIVE_CLIENT_COOKIE)
  revalidatePath("/", "layout")
  if (redirectTo === "/clients") redirect("/clients")
}

export async function setActiveClientAction(id: string | null) {
  const jar = await cookies()
  if (id && (await db.client.findUnique({ where: { id }, select: { id: true } }))) {
    jar.set(ACTIVE_CLIENT_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
  } else {
    jar.delete(ACTIVE_CLIENT_COOKIE)
  }
  revalidatePath("/", "layout")
}
