export const EMIRATES = [
  "Dubai",
  "Abu Dhabi",
  "Sharjah",
  "Ajman",
  "Ras Al Khaimah",
  "Umm Al Quwain",
  "Fujairah",
] as const

export const SERVICES = [
  { value: "Villa Moving", hint: "High-ticket / Large volume" },
  { value: "Apartment Relocation", hint: "High frequency / Fast turn" },
  { value: "Office Moving", hint: "Corporate B2B contracts" },
  { value: "Packing & Unpacking", hint: "Bubble wrap, crates, boxes" },
  { value: "Furniture Dismantling & Assembly", hint: "Carpenters, curtains, IKEA" },
  { value: "Storage Solutions", hint: "Short & long term AC units" },
  { value: "Piano & Heavy Moving", hint: "Specialized hoist & craning" },
  { value: "International Shipping", hint: "Sea, air & road freight" },
] as const

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
  rsa: { label: "Google RSA", tone: "stone" },
  "fb-ad": { label: "Facebook Ad", tone: "teal" },
  humanized: { label: "Humanized Text", tone: "stone" },
  report: { label: "Monthly Report", tone: "teal" },
}

export const ACTIVE_CLIENT_COOKIE = "active_client_id"
export const PAGE_SIZE = 10
