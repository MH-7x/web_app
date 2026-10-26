/** The agency's own details, shown on proposals. Pure, so the Settings UI can use it. */
export type BusinessSettings = { businessName: string; tagline: string; terms: string; phone: string; email: string; website: string }

export const DEFAULT_BUSINESS: BusinessSettings = {
  businessName: "Mashal Huraira",
  tagline: "Digital Marketing & Web Development",
  terms: "",
  phone: "",
  email: "",
  website: "",
}
