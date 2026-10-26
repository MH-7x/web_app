import { normalizeWebsite, slugify, toE164 } from "@/lib/client-schema"
import { db } from "@/lib/db"
import type { Project } from "@/lib/generated/prisma/client"
import { computeTotal, countPages, sanitizeProject, STATUSES, type ProjectData, type ProjectInput, type ProjectListItem, type ProjectStatus } from "@/lib/proposals-types"

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export const isStatus = (v: unknown): v is ProjectStatus => STATUSES.some((s) => s.value === v)

/** A stored row as the app uses it. Damaged JSON reads as empty rather than crashing the page. */
export function toProject(row: Project): ProjectData {
  const input = sanitizeProject({
    ...row,
    pages: parse(row.pages),
    corePages: parse(row.corePages),
    secondaryServices: parse(row.secondaryServices),
    otherCosts: parse(row.otherCosts),
  })
  return {
    ...input,
    // sanitize cleans free text; keep the stored values for fields it would blank
    name: row.name,
    id: row.id,
    servicePageCount: row.servicePageCount,
    locationPageCount: row.locationPageCount,
    totalCost: row.totalCost,
    proposal: row.proposal,
    status: isStatus(row.status) ? row.status : "draft",
    clientId: row.clientId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** The columns for a project; counts and the total are always computed here, never taken from the request. */
export function toColumns(input: ProjectInput) {
  const counts = countPages(input.pages)
  return {
    name: input.name || `${input.clientName} website project`,
    clientName: input.clientName,
    contactName: input.contactName,
    contactWhatsapp: input.contactWhatsapp,
    companyDescription: input.companyDescription,
    websiteUrl: input.websiteUrl,
    category: input.category,
    pages: JSON.stringify(input.pages),
    servicePageCount: counts.service,
    locationPageCount: counts.location,
    corePages: JSON.stringify(input.corePages),
    projectFocus: input.projectFocus,
    secondaryServices: JSON.stringify(input.secondaryServices),
    websiteCost: input.websiteCost,
    seoCost: input.seoCost,
    adsCost: 0,
    socialCost: input.socialCost,
    otherCosts: JSON.stringify(input.otherCosts),
    totalCost: computeTotal(input),
    seoMonths: input.seoMonths,
    adsMonths: 0,
    adsIncluded: input.adsIncluded,
    paymentTerms: input.paymentTerms,
    deliveryWeeks: input.deliveryWeeks,
  }
}

export async function listProjects(status?: string): Promise<ProjectListItem[]> {
  const rows = await db.project.findMany({
    where: isStatus(status) ? { status } : {},
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, clientName: true, status: true, totalCost: true, createdAt: true, updatedAt: true, proposal: true },
  })
  return rows.map((r) => ({ id: r.id, name: r.name, clientName: r.clientName, status: isStatus(r.status) ? r.status : "draft", totalCost: r.totalCost, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), hasProposal: r.proposal.trim() !== "" }))
}

export async function getProject(id: string) {
  const row = await db.project.findUnique({ where: { id } })
  return row ? toProject(row) : null
}

/* ------------------------------------------------------------ convert to client */

const CLIENT_CATEGORY = { moving: "moving", used_furniture: "used_furniture", pickup_rental: "pickup_rental", other: "moving" } as const

async function uniqueSlug(name: string) {
  const base = slugify(name)
  let slug = base
  for (let i = 2; await db.client.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`
  return slug
}

/**
 * Create a client from a project. The project has no Arabic name, so the English one stands in until it is filled in on
 * the Edit Client page; services come from the Service pages and areas from the Location pages.
 */
export async function convertToClient(project: ProjectData) {
  const phone = toE164(project.contactWhatsapp)
  const client = await db.client.create({
    data: {
      name: project.clientName,
      nameAr: project.clientName,
      slug: await uniqueSlug(project.clientName),
      category: CLIENT_CATEGORY[project.category],
      // the project does not record an emirate; Edit Client asks for it
      emirate: "",
      areas: project.pages.filter((p) => p.type === "Location").map((p) => p.name),
      services: project.pages.filter((p) => p.type === "Service").map((p) => p.name),
      phone,
      whatsapp: phone,
      website: normalizeWebsite(project.websiteUrl) || null,
      brandColors: { primary: "#0f766e", secondary: "#e2e8f0" },
      brandSpecs: { truckType: "", uniform: "", initialSetup: [] },
      notes: project.companyDescription || null,
    },
  })
  await db.project.update({ where: { id: project.id }, data: { clientId: client.id } })
  return client
}
