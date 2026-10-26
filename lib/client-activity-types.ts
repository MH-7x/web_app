export type ActivityType = "content" | "ads" | "gbp" | "audit"

export type ActivityItem = {
  id: string
  type: ActivityType
  /** the content type for generated content ("gbp", "faq", "fb-ad"...), the post status for published posts */
  subtype: string | null
  description: string
  /** ISO timestamp */
  date: string
  /** the page that shows the item, or null when there is none */
  linkTo: string | null
  metadata: Record<string, unknown>
}

export const ACTIVITY_FILTERS: { value: "all" | ActivityType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "content", label: "Content" },
  { value: "ads", label: "Ads" },
  { value: "gbp", label: "GBP Posts" },
  { value: "audit", label: "Audits" },
]
