import type { ClientCategory } from "@/lib/constants"
import type { ChecklistItem, ChecklistSection } from "@/lib/onboarding-checklist-types"

const STANDARD: Record<ChecklistSection, string[]> = {
  "Google Properties": [
    "Google Business Profile claimed & verified",
    "GBP description written & published",
    "GBP categories set correctly",
    "GBP photos uploaded (logo, cover, interior, team, services)",
    "Google Search Console property created & verified",
    "Google Analytics (GA4) installed on website",
    "Google Ads account created",
  ],
  "Social Media": ["Facebook business page created", "Instagram business profile created", "Social media pages linked to website"],
  Website: [
    "Website domain purchased",
    "Website built & deployed",
    "SSL certificate active",
    "Mobile responsive verified",
    "Contact forms working",
    "WhatsApp button working",
    "Schema markup implemented (LocalBusiness)",
    "Sitemap submitted to Google Search Console",
  ],
  "Initial Content": [
    "First SEO audit completed",
    "Initial content batch generated (GBP description, FAQ, meta tags)",
    "First month of GBP posts generated",
    "First Google Ads campaign created",
    "Landing pages built for top services",
  ],
  "Client Assets": ["Company logo received", "Brand colors defined", "Company profile document filled", "Google Drive folder created & shared"],
}

/** How each category differs from the standard (moving company) list. */
const ADAPT: Record<ClientCategory, { remove: string[]; add: Partial<Record<ChecklistSection, string[]>> }> = {
  moving: { remove: [], add: {} },
  // sells through listings and the showroom rather than search ads
  used_furniture: {
    remove: ["Google Ads account created", "First Google Ads campaign created"],
    add: { "Client Assets": ["Product catalog photos received"] },
  },
  // a smaller operation: no Instagram requirement and no per-service landing pages
  pickup_rental: {
    remove: ["Instagram business profile created", "Landing pages built for top services"],
    add: { Website: ["Pricing table on website"], "Client Assets": ["Fleet photos uploaded"] },
  },
}

/** A fresh checklist for a new client of this category. Every call mints new item ids. */
export function getDefaultChecklist(category: ClientCategory): ChecklistItem[] {
  const { remove, add } = ADAPT[category]
  return (Object.entries(STANDARD) as [ChecklistSection, string[]][]).flatMap(([section, labels]) =>
    [...labels.filter((label) => !remove.includes(label)), ...(add[section] ?? [])].map(
      (label): ChecklistItem => ({ id: crypto.randomUUID(), label, section, checked: false, checkedAt: null, isCustom: false })
    )
  )
}
