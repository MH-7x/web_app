import { isValidUrl, normalizeWebsite } from "@/lib/client-schema"
import { seedCitationSources } from "@/lib/citation-sources-seed"
import {
  MATCH_FIELDS,
  PRIORITIES,
  RELEVANT_FOR,
  SOURCE_FIELDS,
  TIERS,
  SOURCE_TYPES,
  isCitationStatus,
  isLinkStatus,
  isPriority,
  isRelevant,
  isRelevantFor,
  isSourceCategory,
  isSourceField,
  isSourceType,
  issuesFor,
  summarizeClient,
  tracksField,
  type CitationDTO,
  type CitationStatus,
  type ClientNapSummary,
  type CompetitorDTO,
  type MatchField,
  type SourceDTO,
} from "@/lib/citations-types"
import { DEFAULT_CATEGORY, isCategory, type ClientCategory } from "@/lib/constants"
import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import type { CitationCompetitor, CitationSource, ClientCitation } from "@/lib/generated/prisma/client"

const list = (json: string): string[] => {
  try {
    const v: unknown = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

export function toSourceDTO(row: CitationSource): SourceDTO {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    submitUrl: row.submitUrl,
    sourceType: isSourceType(row.sourceType) ? row.sourceType : "nap_citation",
    category: row.category,
    domainAuthority: row.domainAuthority,
    relevantFor: list(row.relevantFor),
    napFields: list(row.napFields),
    isFree: row.isFree,
    priority: row.priority,
    tier: row.tier,
    notes: row.notes,
  }
}

export function toCitationDTO(row: ClientCitation & { source: CitationSource }): CitationDTO {
  return {
    id: row.id,
    status: isCitationStatus(row.status) ? row.status : "unchecked",
    nameMatch: row.nameMatch,
    addressMatch: row.addressMatch,
    phoneMatch: row.phoneMatch,
    websiteMatch: row.websiteMatch,
    listingUrl: row.listingUrl,
    linkUrl: row.linkUrl,
    linkStatus: isLinkStatus(row.linkStatus) ? row.linkStatus : "",
    linkCreatedAt: row.linkCreatedAt?.toISOString() ?? null,
    issues: list(row.issues),
    actionDone: row.actionDoneAt !== null,
    lastChecked: row.lastChecked?.toISOString() ?? null,
    source: toSourceDTO(row.source),
  }
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }
const bySource = (a: SourceDTO, b: SourceDTO) => a.tier - b.tier || (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) || a.name.localeCompare(b.name)

/* ----------------------------------------------------------------- sources */

/** Every directory, seeding the starter list the first time the table is found empty. Most important first. */
export async function listSources(filters: { category?: string; priority?: string; relevantFor?: string; sourceType?: string } = {}): Promise<SourceDTO[]> {
  await seedCitationSources()
  const rows = await db.citationSource.findMany({
    where: {
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.sourceType && isSourceType(filters.sourceType) ? { sourceType: filters.sourceType } : {}),
    },
  })
  const sources = rows.map(toSourceDTO)
  const relevant = filters.relevantFor
  return (relevant && isRelevantFor(relevant) && relevant !== "all" ? sources.filter((s) => isRelevant(s.relevantFor, relevant)) : sources).sort(bySource)
}

type SourceBody = Record<string, unknown>

/** Check a request body and turn it into columns. `partial` leaves out whatever wasn't sent (for edits). */
export function parseSourceInput(b: SourceBody, partial: boolean) {
  const data: Record<string, string | number | boolean> = {}
  const has = (k: string) => b[k] !== undefined

  if (!partial || has("name")) {
    const name = typeof b.name === "string" ? b.name.trim() : ""
    if (!name) throw new BadRequestError("Enter the directory's name.")
    if (name.length > 100) throw new BadRequestError("The name is over 100 characters.")
    data.name = name
  }
  if (!partial || has("url")) {
    const url = typeof b.url === "string" ? b.url.trim() : ""
    if (!url || !isValidUrl(url)) throw new BadRequestError("Enter the directory's website address, like https://www.example.com.")
    data.url = normalizeWebsite(url)
  }
  if (has("submitUrl")) {
    const submit = typeof b.submitUrl === "string" ? b.submitUrl.trim() : ""
    if (submit && !isValidUrl(submit)) throw new BadRequestError("The submit URL isn't a valid web address.")
    data.submitUrl = submit ? normalizeWebsite(submit) : ""
  }
  if (has("sourceType")) {
    if (!isSourceType(b.sourceType)) throw new BadRequestError(`Source type must be ${SOURCE_TYPES.join(" or ")}.`)
    data.sourceType = b.sourceType
    // a backlink has no name/address/phone/website to check
    if (b.sourceType === "backlink") data.napFields = "[]"
  }
  if (has("category")) {
    if (!isSourceCategory(b.category)) throw new BadRequestError("Choose a category from the list.")
    data.category = b.category
  }
  if (has("priority")) {
    if (!isPriority(b.priority)) throw new BadRequestError(`Priority must be ${PRIORITIES.join(", ")}.`)
    data.priority = b.priority
  }
  if (has("tier")) {
    if (!(TIERS as readonly unknown[]).includes(b.tier)) throw new BadRequestError("Tier must be 1, 2, 3 or 4.")
    data.tier = b.tier as number
  }
  if (has("domainAuthority")) {
    const da = b.domainAuthority
    if (typeof da !== "number" || !Number.isInteger(da) || da < 0 || da > 100) throw new BadRequestError("Domain authority is a whole number from 0 to 100.")
    data.domainAuthority = da
  }
  if (has("isFree")) {
    if (typeof b.isFree !== "boolean") throw new BadRequestError("isFree must be true or false.")
    data.isFree = b.isFree
  }
  if (has("relevantFor")) {
    const picked = Array.isArray(b.relevantFor) ? b.relevantFor.filter(isRelevantFor) : []
    if (!picked.length) throw new BadRequestError(`Choose who this is relevant for: ${RELEVANT_FOR.join(", ")}.`)
    data.relevantFor = JSON.stringify(picked.includes("all") ? ["all"] : [...new Set(picked)])
  }
  if (has("napFields") && b.sourceType !== "backlink") {
    const fields = Array.isArray(b.napFields) ? b.napFields.filter(isSourceField) : []
    data.napFields = JSON.stringify([...new Set(fields)].sort((a, c) => SOURCE_FIELDS.indexOf(a) - SOURCE_FIELDS.indexOf(c)))
  }
  if (has("notes")) {
    const notes = typeof b.notes === "string" ? b.notes.trim() : ""
    if (notes.length > 1000) throw new BadRequestError("Notes are over 1000 characters.")
    data.notes = notes
  }
  return data
}

/* --------------------------------------------------------------- citations */

const withSource = { source: true } as const

export async function listClientCitations(clientId: string): Promise<CitationDTO[]> {
  const rows = await db.clientCitation.findMany({ where: { clientId }, include: withSource })
  return rows.map(toCitationDTO).sort((a, b) => bySource(a.source, b.source))
}

/** A NAP summary for every client, including those that haven't started tracking. Worst score first, so the clients that need work lead. */
export async function listClientSummaries(): Promise<ClientNapSummary[]> {
  const [clients, rows] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, category: true, emirate: true } }),
    db.clientCitation.findMany({ include: withSource }),
  ])
  const byClient = new Map<string, CitationDTO[]>()
  for (const row of rows) byClient.set(row.clientId, [...(byClient.get(row.clientId) ?? []), toCitationDTO(row)])
  return clients
    .map((c) => summarizeClient({ id: c.id, name: c.name, category: isCategory(c.category) ? c.category : DEFAULT_CATEGORY, emirate: c.emirate }, byClient.get(c.id) ?? []))
    .sort((a, b) => (a.score ?? 101) - (b.score ?? 101) || a.client.name.localeCompare(b.client.name))
}

/** Directories relevant to this client that it isn't tracking yet. */
async function untrackedSources(clientId: string, category: ClientCategory) {
  const [sources, tracked] = await Promise.all([listSources(), db.clientCitation.findMany({ where: { clientId }, select: { citationSourceId: true } })])
  const have = new Set(tracked.map((t) => t.citationSourceId))
  return sources.filter((s) => !have.has(s.id) && isRelevant(s.relevantFor, category))
}

export async function countUntracked(clientId: string, category: ClientCategory) {
  return (await untrackedSources(clientId, category)).length
}

/** Start tracking: one unchecked citation per relevant directory. Safe to repeat, it only adds the ones that are missing. */
export async function initializeCitations(clientId: string, category: ClientCategory) {
  const missing = await untrackedSources(clientId, category)
  if (missing.length) {
    await db.clientCitation.createMany({ data: missing.map((s) => ({ clientId, citationSourceId: s.id })) })
  }
  return missing.length
}

export type CitationUpdate = Partial<Record<"status" | "listingUrl" | "actionDone" | "linkUrl" | "linkStatus", unknown>> & Partial<Record<`${MatchField}Match`, unknown>>

/**
 * Apply an edit to a backlink: `linkUrl` and `linkStatus` only. A URL with no status starts as "pending"; "live" needs a URL; clearing the
 * URL while the link was live or dead puts it back to "not created". `linkCreatedAt` is set the first time a link is recorded.
 */
export function buildBacklinkUpdate(current: ClientCitation, b: CitationUpdate) {
  const data: Record<string, string | Date | null> = {}

  let url = current.linkUrl
  if (b.linkUrl !== undefined) {
    const raw = typeof b.linkUrl === "string" ? b.linkUrl.trim() : ""
    if (raw && !isValidUrl(raw)) throw new BadRequestError("The link URL isn't a valid web address.")
    url = raw ? normalizeWebsite(raw) : ""
  }
  let status = current.linkStatus
  if (b.linkStatus !== undefined) {
    if (b.linkStatus !== "" && !isLinkStatus(b.linkStatus)) throw new BadRequestError("Link status must be pending, live, dead or empty.")
    status = b.linkStatus as string
  } else if (!url && (status === "live" || status === "dead")) {
    status = ""
  }
  if (url && !status) status = "pending"
  if (status === "live" && !url) throw new BadRequestError("Add the link URL before marking the link live.")

  if (url !== current.linkUrl) data.linkUrl = url
  if (status !== current.linkStatus) data.linkStatus = status
  const hadLink = Boolean(current.linkUrl || current.linkStatus)
  const hasLink = Boolean(url || status)
  if (!hadLink && hasLink) data.linkCreatedAt = new Date()
  if (hadLink && !hasLink) data.linkCreatedAt = null

  if (!Object.keys(data).length) throw new BadRequestError("Nothing to update.")
  return data
}

/**
 * Apply an edit to one citation. The status and the four name/address/phone/website ticks are kept consistent: a listing with any
 * wrong detail is "issues found", and a listing with all details right is "listed". A new check clears the plan tick.
 * Backlink sources are handed to `buildBacklinkUpdate`: they have no NAP details to check.
 */
export function buildCitationUpdate(current: ClientCitation & { source: CitationSource }, b: CitationUpdate) {
  if (current.source.sourceType === "backlink") return buildBacklinkUpdate(current, b)
  const source = toSourceDTO(current.source)
  const data: Record<string, string | boolean | Date | null> = {}

  const matchSent = MATCH_FIELDS.filter((f) => b[`${f}Match`] !== undefined)
  for (const f of matchSent) {
    if (typeof b[`${f}Match`] !== "boolean") throw new BadRequestError(`${f}Match must be true or false.`)
  }
  if (b.status !== undefined && !isCitationStatus(b.status)) throw new BadRequestError("Unknown status.")
  if (b.listingUrl !== undefined) {
    const url = typeof b.listingUrl === "string" ? b.listingUrl.trim() : ""
    if (url && !isValidUrl(url)) throw new BadRequestError("The listing URL isn't a valid web address.")
    data.listingUrl = url ? normalizeWebsite(url) : ""
  }
  if (b.actionDone !== undefined) {
    if (typeof b.actionDone !== "boolean") throw new BadRequestError("actionDone must be true or false.")
    data.actionDoneAt = b.actionDone ? new Date() : null
  }

  const checked = b.status !== undefined || matchSent.length > 0
  if (checked) {
    let status: CitationStatus = (b.status as CitationStatus | undefined) ?? (current.status as CitationStatus)
    const matches: Record<MatchField, boolean> = {
      name: (b.nameMatch as boolean | undefined) ?? current.nameMatch,
      address: (b.addressMatch as boolean | undefined) ?? current.addressMatch,
      phone: (b.phoneMatch as boolean | undefined) ?? current.phoneMatch,
      website: (b.websiteMatch as boolean | undefined) ?? current.websiteMatch,
    }

    if (status === "listed" || status === "issues_found") {
      // marking a directory "listed" with no detail given means the details are right, so start from all ticked
      const wasListed = current.status === "listed" || current.status === "issues_found"
      if (!wasListed && matchSent.length === 0) for (const f of MATCH_FIELDS) matches[f] = true
      for (const f of MATCH_FIELDS) if (!tracksField(source, f)) matches[f] = true
      const wrong = MATCH_FIELDS.filter((f) => !matches[f])
      status = wrong.length ? "issues_found" : "listed"
      data.issues = JSON.stringify(issuesFor({ nameMatch: matches.name, addressMatch: matches.address, phoneMatch: matches.phone, websiteMatch: matches.website, source }))
    } else {
      // not listed or not checked: there is no listing to compare, so no matches and no issues
      for (const f of MATCH_FIELDS) matches[f] = false
      data.issues = "[]"
    }

    data.status = status
    data.nameMatch = matches.name
    data.addressMatch = matches.address
    data.phoneMatch = matches.phone
    data.websiteMatch = matches.website
    data.lastChecked = status === "unchecked" ? null : new Date()
    // the old "fixed / submitted" tick describes the previous state
    if (b.actionDone === undefined) data.actionDoneAt = null
  }

  if (!Object.keys(data).length) throw new BadRequestError("Nothing to update.")
  return data
}

/* -------------------------------------------------------------- competitors */

export function toCompetitorDTO(row: CitationCompetitor): CompetitorDTO {
  return { id: row.id, name: row.name, sourceIds: list(row.sourceIds) }
}

export async function listCompetitors(clientId: string): Promise<CompetitorDTO[]> {
  return (await db.citationCompetitor.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } })).map(toCompetitorDTO)
}
