import type { ClientDetail } from "@/lib/clients"
import { CATEGORY_INFO } from "@/lib/constants"
import { getCategoryContext, getCategoryFallbackServices } from "@/lib/prompts/templates"

/** Prompt pieces shared by the content and ads generators. */

export type Lang = "en" | "ar"

export const tone = (client: ClientDetail) => client.tones.join(", ").toLowerCase() || "professional, trustworthy"
export const services = (client: ClientDetail) => client.services.join(", ") || getCategoryFallbackServices(client.category)
/** Business-category section for the system prompt; empty for moving companies. */
export const categoryContext = (client: Pick<ClientDetail, "category">) => getCategoryContext(client.category)
export const areas = (client: ClientDetail) => client.areas.join(", ") || `all areas of ${client.emirate}`

export const LANGUAGE_RULE: Record<Lang, string> = {
  en: "Write in clear, natural English.",
  ar: "Write in natural Modern Standard Arabic with a Gulf-friendly, conversational feel, the way UAE moving companies actually advertise. It must read as originally written in Arabic, never as a translation.",
}

/** Facts the model may rely on, and the guard against inventing others. */
export function clientBrief(client: ClientDetail) {
  const lines = [
    `Company: ${client.name} (${client.nameAr})`,
    client.category !== "moving" && `Business type: ${CATEGORY_INFO[client.category].label}`,
    `Primary emirate: ${client.emirate}`,
    `Services: ${services(client)}`,
    `Areas served: ${areas(client)}`,
    client.website && `Website: ${client.website}`,
    client.truckType && `Fleet: ${client.truckType}`,
    client.uniform && `Crew uniform: ${client.uniform}`,
    client.notes && `Internal notes (context only, never quote them): ${client.notes}`,
  ]
  return lines.filter(Boolean).join("\n")
}

export const NO_INVENTING =
  "Only state facts present in the client details or the request. Never invent years in business, fleet size, licence numbers, awards, prices, discounts or review counts."
