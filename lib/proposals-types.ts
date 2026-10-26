/** Shared shapes and rules for website projects and proposals. No server imports, so the UI can use them too. */

export const PROJECT_CATEGORIES = [
  { value: "moving", label: "Moving Company" },
  { value: "used_furniture", label: "Used Furniture" },
  { value: "pickup_rental", label: "Pickup Rental" },
  { value: "other", label: "Other" },
] as const
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number]["value"]

export const PAGE_TYPES = ["Service", "Location", "Core", "Other"] as const
export type PageType = (typeof PAGE_TYPES)[number]
export type ProjectPage = { name: string; type: PageType; notes: string }

export const CORE_PAGES = [
  { value: "home", label: "Home" },
  { value: "about", label: "About" },
  { value: "contact", label: "Contact" },
  { value: "blog", label: "Blog" },
] as const

export const FOCUSES = [
  { value: "ads", label: "Google Ads", hint: "Paid search brings the leads while the site is built to convert them." },
  { value: "seo", label: "SEO", hint: "Organic rankings for the services and areas the business covers." },
  { value: "combined", label: "SEO + Google Ads", hint: "Ads for immediate leads, SEO for lasting visibility." },
] as const
export type ProjectFocus = (typeof FOCUSES)[number]["value"]

export const SECONDARY_SERVICES = [
  { value: "facebook", label: "Facebook page setup" },
  { value: "instagram", label: "Instagram page setup" },
  { value: "social_management", label: "Social media management" },
  { value: "gbp", label: "Google Business Profile setup" },
] as const

export const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
] as const
export type ProjectStatus = (typeof STATUSES)[number]["value"]

export type OtherCost = { name: string; amount: number }

/** What the form edits. */
export type ProjectInput = {
  name: string
  clientName: string
  contactName: string
  contactWhatsapp: string
  companyDescription: string
  websiteUrl: string
  category: ProjectCategory
  pages: ProjectPage[]
  corePages: string[]
  projectFocus: ProjectFocus
  secondaryServices: string[]
  /** Google Ads management comes with the website price: it is listed as included, with no price or duration */
  adsIncluded: boolean
  websiteCost: number
  seoCost: number
  socialCost: number
  otherCosts: OtherCost[]
  seoMonths: number
  paymentTerms: string
  deliveryWeeks: number
}

/** A saved project. The page counts and the total are worked out, never typed in. */
export type ProjectData = ProjectInput & {
  id: string
  servicePageCount: number
  locationPageCount: number
  totalCost: number
  proposal: string
  status: ProjectStatus
  clientId: string | null
  createdAt: string
  updatedAt: string
}

export type ProjectListItem = Pick<ProjectData, "id" | "name" | "clientName" | "status" | "totalCost" | "createdAt" | "updatedAt"> & { hasProposal: boolean }

export const EMPTY_PROJECT: ProjectInput = {
  name: "",
  clientName: "",
  contactName: "",
  contactWhatsapp: "",
  companyDescription: "",
  websiteUrl: "",
  category: "moving",
  pages: [],
  corePages: ["home", "about", "contact"],
  projectFocus: "seo",
  secondaryServices: [],
  adsIncluded: false,
  websiteCost: 0,
  seoCost: 0,
  socialCost: 0,
  otherCosts: [],
  seoMonths: 0,
  paymentTerms: "50% upfront, 50% on delivery",
  deliveryWeeks: 4,
}

/* ------------------------------------------------------------------ rules */

export const countPages = (pages: ProjectPage[]) => ({
  service: pages.filter((p) => p.type === "Service").length,
  location: pages.filter((p) => p.type === "Location").length,
})

export function computeTotal(p: Pick<ProjectInput, "websiteCost" | "seoCost" | "socialCost" | "otherCosts">) {
  const sum = p.websiteCost + p.seoCost + p.socialCost + p.otherCosts.reduce((n, c) => n + c.amount, 0)
  return Math.round(sum * 100) / 100
}

export const formatAed = (n: number) => `AED ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const money = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""))
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 100) / 100, 100_000_000) : 0
}
const whole = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
}
const oneOf = <T extends string>(v: unknown, options: readonly { value: T }[], fallback: T): T => options.find((o) => o.value === v)?.value ?? fallback
const subset = <T extends string>(v: unknown, options: readonly { value: T }[]) => options.map((o) => o.value).filter((o) => Array.isArray(v) && v.includes(o))

/** Untrusted input -> a well-formed ProjectInput. Never throws; use validateProject for the rules that need a message. */
export function sanitizeProject(raw: unknown): ProjectInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const pages: ProjectPage[] = (Array.isArray(r.pages) ? r.pages : [])
    .slice(0, 80)
    .map((row): ProjectPage => {
      const p = (row && typeof row === "object" ? row : {}) as Record<string, unknown>
      return { name: str(p.name, 100), type: PAGE_TYPES.find((t) => t === p.type) ?? "Service", notes: str(p.notes, 300) }
    })
    .filter((p) => p.name)
  const otherCosts: OtherCost[] = (Array.isArray(r.otherCosts) ? r.otherCosts : [])
    .slice(0, 20)
    .map((row) => {
      const c = (row && typeof row === "object" ? row : {}) as Record<string, unknown>
      return { name: str(c.name, 80), amount: money(c.amount) }
    })
    .filter((c) => c.name || c.amount)
  return {
    name: str(r.name, 120),
    clientName: str(r.clientName, 120),
    contactName: str(r.contactName, 120),
    contactWhatsapp: str(r.contactWhatsapp, 30),
    companyDescription: str(r.companyDescription, 2000),
    websiteUrl: str(r.websiteUrl, 200),
    category: oneOf(r.category, PROJECT_CATEGORIES, "moving"),
    pages,
    corePages: subset(r.corePages, CORE_PAGES),
    projectFocus: oneOf(r.projectFocus, FOCUSES, "seo"),
    secondaryServices: subset(r.secondaryServices, SECONDARY_SERVICES),
    adsIncluded: r.adsIncluded === true,
    websiteCost: money(r.websiteCost),
    seoCost: money(r.seoCost),
    socialCost: money(r.socialCost),
    otherCosts: otherCosts.map((c) => ({ name: c.name || "Other", amount: c.amount })),
    seoMonths: whole(r.seoMonths, 0, 12),
    paymentTerms: str(r.paymentTerms, 1000),
    deliveryWeeks: whole(r.deliveryWeeks, 1, 52),
  }
}

export type ProjectErrors = Partial<Record<keyof ProjectInput, string>>

/** Fields each wizard step owns, so "next" can validate just that step. */
export const PROJECT_STEP_FIELDS: (keyof ProjectInput)[][] = [
  ["clientName", "contactName", "contactWhatsapp", "websiteUrl"],
  ["pages", "corePages"],
  ["projectFocus", "seoMonths"],
  ["websiteCost", "otherCosts", "deliveryWeeks"],
  [],
]

export function validateProject(p: ProjectInput, fields?: (keyof ProjectInput)[]): ProjectErrors {
  const errors: ProjectErrors = {}
  const check = (key: keyof ProjectInput, message: string | null) => {
    if (message && (!fields || fields.includes(key))) errors[key] = message
  }
  check("clientName", p.clientName.length < 2 ? "Enter the client's company name." : null)
  const digits = p.contactWhatsapp.replace(/\D/g, "")
  check("contactWhatsapp", p.contactWhatsapp && (digits.length < 8 || digits.length > 15) ? "Enter a valid WhatsApp number." : null)
  check("pages", p.pages.length === 0 && p.corePages.length === 0 ? "Add at least one page or tick a core page." : null)
  check("websiteCost", computeTotal(p) <= 0 ? "Enter at least one cost so the proposal has a price." : null)
  return errors
}

/** The name shown in lists when none was typed. */
export const projectName = (p: Pick<ProjectInput, "name" | "clientName">) => p.name || `${p.clientName} website project`
