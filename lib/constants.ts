export const EMIRATES = [
  "Dubai",
  "Abu Dhabi",
  "Sharjah",
  "Ajman",
  "Ras Al Khaimah",
  "Umm Al Quwain",
  "Fujairah",
] as const

export const CATEGORIES = ["moving", "used_furniture", "pickup_rental"] as const
export type ClientCategory = (typeof CATEGORIES)[number]
export const DEFAULT_CATEGORY: ClientCategory = "moving"

export const CATEGORY_INFO: Record<ClientCategory, { label: string; short: string; hint: string }> = {
  moving: { label: "Moving Company", short: "Moving", hint: "Movers, packers, relocation" },
  used_furniture: { label: "Used Furniture", short: "Furniture", hint: "Buy, sell, restore furniture" },
  pickup_rental: { label: "Pickup for Rent", short: "Rental", hint: "1–3 ton pickups, daily/weekly/monthly" },
}

export const isCategory = (value: unknown): value is ClientCategory => (CATEGORIES as readonly string[]).includes(value as string)

export type ServiceOption = { value: string; hint: string }

export const SERVICES_BY_CATEGORY: Record<ClientCategory, readonly ServiceOption[]> = {
  moving: [
    { value: "Villa Moving", hint: "High-ticket / Large volume" },
    { value: "Apartment Relocation", hint: "High frequency / Fast turn" },
    { value: "Office Moving", hint: "Corporate B2B contracts" },
    { value: "Packing & Unpacking", hint: "Bubble wrap, crates, boxes" },
    { value: "Furniture Dismantling & Assembly", hint: "Carpenters, curtains, IKEA" },
    { value: "Storage Solutions", hint: "Short & long term AC units" },
    { value: "Piano & Heavy Moving", hint: "Specialized hoist & craning" },
    { value: "International Shipping", hint: "Sea, air & road freight" },
  ],
  used_furniture: [
    { value: "Buying Used Furniture", hint: "Cash offers for pre-owned pieces" },
    { value: "Selling Used Furniture", hint: "Showroom & online listings" },
    { value: "Furniture Restoration", hint: "Repair, refinishing, reupholstery" },
    { value: "Furniture Delivery", hint: "Delivery to the buyer's door" },
    { value: "Home Staging", hint: "Furnished looks for sale or rent" },
    { value: "Office Furniture Clearance", hint: "Bulk buy-outs from offices" },
    { value: "Furniture Pickup", hint: "Collection from the seller" },
    { value: "Furniture Inspection & Appraisal", hint: "Condition checks and valuation" },
  ],
  pickup_rental: [
    { value: "1-Ton Pickup", hint: "Small loads, city runs" },
    { value: "2-Ton Pickup", hint: "Mid-size loads" },
    { value: "3-Ton Pickup", hint: "Heavy and bulky loads" },
    { value: "Self-Drive Rental", hint: "Customer drives" },
    { value: "With-Driver Rental", hint: "Driver included" },
    { value: "Daily Rental", hint: "Short, one-off jobs" },
    { value: "Weekly Rental", hint: "Multi-day projects" },
    { value: "Monthly Rental", hint: "Ongoing business use" },
    { value: "Event Logistics", hint: "Exhibitions, setups, transport" },
    { value: "Small Business Delivery", hint: "Regular delivery runs" },
  ],
}

/** The moving list, kept under its old name for existing imports. */
export const SERVICES = SERVICES_BY_CATEGORY.moving

export const TONES = [
  "Professional",
  "Trustworthy",
  "Friendly",
  "Family-friendly",
  "Premium",
  "Punctual",
  "Careful",
  "Budget-friendly",
] as const

export const INITIAL_SETUP_OPTIONS = [
  { value: "gbp-description", label: "GBP Description (Arabic + English)", hint: "750 character optimized profile copy" },
  { value: "faq", label: "10 FAQ Items", hint: "Building permits, Ejari, packaging details" },
  { value: "gbp-posts", label: "Month of GBP Posts", hint: "Three posts a week for four weeks, bilingual" },
  { value: "fb-ads", label: "3 Facebook Ad Variations", hint: "Lead gen carousel + single image concepts" },
] as const

export const CONTENT_TYPES: Record<string, { label: string; tone: string }> = {
  gbp: { label: "GBP Description", tone: "teal" },
  faq: { label: "FAQ Generator", tone: "stone" },
  blog: { label: "Blog Post", tone: "sky" },
  meta: { label: "Meta Tags", tone: "amber" },
  landing: { label: "Landing Page", tone: "sky" },
  rsa: { label: "Google RSA", tone: "stone" },
  "fb-ad": { label: "Facebook Ad", tone: "teal" },
  humanized: { label: "Humanized Text", tone: "stone" },
  report: { label: "Monthly Report", tone: "teal" },
}

export const ACTIVE_CLIENT_COOKIE = "active_client_id"
export const PAGE_SIZE = 10
