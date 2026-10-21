import type { CategoryId, Grade, GroupId, Priority, Severity } from "@/lib/audit/types"

/**
 * Runtime constants and helpers for the audit. They live apart from types.ts (which is types only) so that anything
 * needing them imports a module that always exports them.
 */

export const GROUPS: { id: GroupId; label: string; why: string }[] = [
  { id: "onPage", label: "On-Page SEO", why: "Titles, descriptions, headings, content and structured data tell search engines what each page is about and decide how it looks in results." },
  { id: "geo", label: "GEO", why: "AI assistants and answer engines now send visitors too. This checks whether they can read the site and understand who the business is." },
  { id: "links", label: "Links", why: "Working internal links spread authority and help crawlers reach every page; broken ones waste both." },
  { id: "usability", label: "Usability", why: "Most searches happen on phones. Pages that are hard to use or slow for real visitors lose rankings and enquiries." },
  { id: "performance", label: "Performance", why: "Speed affects rankings and how many visitors stay long enough to call or message." },
  { id: "social", label: "Social", why: "Linked profiles and share previews build trust and control how links look when people share them." },
  { id: "local", label: "Local SEO", why: "For a local mover, consistent name, address and phone, plus complete local schema, drive map and local-pack visibility." },
  { id: "technology", label: "Technology", why: "Hosting, security and email setup affect reliability, trust and whether business email lands in the inbox." },
  { id: "multilingual", label: "Multilingual (AR/EN)", why: "Arabic and English versions must be tied together correctly or search engines show the wrong language, or treat them as duplicates." },
  { id: "crawlHealth", label: "Crawl Health", why: "Whether search engines can reach, read and index the site: status codes, robots.txt, sitemap, redirects and canonicals." },
]

export const gradeFor = (score: number): Grade => (score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F")

export const priorityFor = (severity: Severity): Priority => (severity === "critical" ? "high" : severity === "warning" ? "medium" : "low")

/** The four categories of the earlier audit, kept so older stored audits still display. */
export const CATEGORIES: { id: CategoryId; label: string; eyebrow: string }[] = [
  { id: "onPage", label: "On-Page SEO", eyebrow: "Content & headers" },
  { id: "schema", label: "Local Schema & Entity", eyebrow: "Knowledge graph" },
  { id: "speed", label: "Speed & Vitals", eyebrow: "UX & performance" },
  { id: "indexation", label: "Indexation & Crawl", eyebrow: "Googlebot access" },
]
