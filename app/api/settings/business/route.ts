import { NextResponse } from "next/server"

import type { BusinessSettings } from "@/lib/business-types"
import { BadRequestError } from "@/lib/content-types"
import { handleError, readJson } from "@/lib/gbp-posts-api"
import { saveBusinessSettings } from "@/lib/settings"

/** Save the business name, tagline and proposal terms shown on proposals. */
export async function PUT(request: Request) {
  try {
    const b = await readJson(request)
    const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
    const next: BusinessSettings = { businessName: text(b.businessName, 100), tagline: text(b.tagline, 150), terms: text(b.terms, 6000), phone: text(b.phone, 40), email: text(b.email, 120), website: text(b.website, 200) }
    if (!next.businessName) throw new BadRequestError("Enter your business name.")
    return NextResponse.json({ settings: await saveBusinessSettings(next) })
  } catch (error) {
    return handleError(error, "settings/business")
  }
}
