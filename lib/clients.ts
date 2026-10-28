import { parseNotes } from "@/lib/client-notes"
import { asOtherLinks, asRecord, asStringArray } from "@/lib/client-schema"
import { DEFAULT_CATEGORY, PAGE_SIZE, isCategory, type ClientCategory } from "@/lib/constants"
import { db } from "@/lib/db"
import { checklistProgress, type ChecklistProgress } from "@/lib/onboarding-checklist-types"
import { parseChecklist, seedChecklists } from "@/lib/onboarding-checklist"
import type { Prisma } from "@/lib/generated/prisma/client"

export type ClientListItem = {
  id: string
  name: string
  nameAr: string
  slug: string
  category: ClientCategory
  emirate: string
  servicesCount: number
  website: string | null
  contentCount: number
  lastActivity: Date
  checklist: ChecklistProgress
}

export type ClientFilters = { q?: string; emirate?: string; category?: string }

function whereFor({ q, emirate, category }: ClientFilters): Prisma.ClientWhereInput {
  const term = q?.trim()
  return {
    ...(emirate ? { emirate } : {}),
    ...(isCategory(category) ? { category } : {}),
    ...(term
      ? {
          OR: [
            { name: { contains: term } },
            { nameAr: { contains: term } },
            { emirate: { contains: term } },
            { website: { contains: term } },
          ],
        }
      : {}),
  }
}

export async function listClients(filters: ClientFilters, page: number) {
  const where = whereFor(filters)
  const [total, rows] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { content: true } },
        content: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
  ])

  // clients created before the checklist existed get their default list the first time they are listed
  const checklists = await seedChecklists(rows)

  const items: ClientListItem[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    nameAr: c.nameAr,
    slug: c.slug,
    category: isCategory(c.category) ? c.category : DEFAULT_CATEGORY,
    emirate: c.emirate,
    servicesCount: asStringArray(c.services).length,
    website: c.website,
    contentCount: c._count.content,
    lastActivity: c.content[0]?.createdAt ?? c.updatedAt,
    checklist: checklistProgress(checklists.get(c.id) ?? []),
  }))
  return { items, total }
}

/** Every client matching the filters, for CSV export. */
export async function listAllClients(filters: ClientFilters) {
  return db.client.findMany({ where: whereFor(filters), orderBy: { name: "asc" } })
}

export async function getEmirateCounts() {
  const groups = await db.client.groupBy({ by: ["emirate"], _count: { _all: true } })
  return Object.fromEntries(groups.map((g) => [g.emirate, g._count._all]))
}

export async function getClientOptions() {
  return db.client.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, nameAr: true, emirate: true },
  })
}

export async function getClient(id: string) {
  // the OAuth credentials column is never needed by the app, so keep it out of every client object
  const client = await db.client.findUnique({ where: { id }, omit: { apiCredentials: true } })
  if (!client) return null
  const brandSpecs = asRecord(client.brandSpecs)
  const brandColors = asRecord(client.brandColors)
  return {
    id: client.id,
    name: client.name,
    nameAr: client.nameAr,
    slug: client.slug,
    category: (isCategory(client.category) ? client.category : DEFAULT_CATEGORY) as ClientCategory,
    emirate: client.emirate,
    emiratesServed: asStringArray(client.emiratesServed),
    areas: asStringArray(client.areas),
    services: asStringArray(client.services),
    phone: client.phone,
    whatsapp: client.whatsapp,
    website: client.website,
    placeId: client.placeId,
    primaryColor: typeof brandColors.primary === "string" ? brandColors.primary : null,
    secondaryColor: typeof brandColors.secondary === "string" ? brandColors.secondary : null,
    truckType: typeof brandSpecs.truckType === "string" ? brandSpecs.truckType : "",
    uniform: typeof brandSpecs.uniform === "string" ? brandSpecs.uniform : "",
    initialSetup: asStringArray(brandSpecs.initialSetup),
    tones: (client.tone ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    notes: client.notes ?? "",
    quickNotes: parseNotes(client.clientNotes),
    checklist: checklistProgress(parseChecklist(client.onboardingChecklist)),
    companyProfile: client.companyProfile,
    facebookUrl: client.facebookUrl,
    instagramUrl: client.instagramUrl,
    driveLink: client.driveLink,
    otherLinks: asOtherLinks(client.otherLinks),
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  }
}

export type ClientDetail = NonNullable<Awaited<ReturnType<typeof getClient>>>

export async function getClientContentStats(clientId: string) {
  const [byType, recent, total] = await Promise.all([
    db.generatedContent.groupBy({ by: ["type"], where: { clientId }, _count: { _all: true } }),
    db.generatedContent.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, type: true, content: true, createdAt: true } }),
    db.generatedContent.count({ where: { clientId } }),
  ])
  return {
    total,
    byType: Object.fromEntries(byType.map((g) => [g.type, g._count._all])) as Record<string, number>,
    recent,
  }
}

export async function listClientContent(clientId: string, opts: { type?: string; q?: string }) {
  const q = opts.q?.trim()
  return db.generatedContent.findMany({
    where: {
      clientId,
      ...(opts.type ? { type: opts.type } : {}),
      ...(q ? { OR: [{ content: { contains: q } }, { contentAr: { contains: q } }, { subtype: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, type: true, subtype: true, language: true, content: true, contentAr: true, humanized: true, createdAt: true, metadata: true },
  })
}
