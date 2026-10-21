import { asRecord, asStringArray } from "@/lib/client-schema"
import { PAGE_SIZE } from "@/lib/constants"
import { db } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"

export type ClientListItem = {
  id: string
  name: string
  nameAr: string
  slug: string
  emirate: string
  servicesCount: number
  website: string | null
  contentCount: number
  lastActivity: Date
}

export type ClientFilters = { q?: string; emirate?: string }

function whereFor({ q, emirate }: ClientFilters): Prisma.ClientWhereInput {
  const term = q?.trim()
  return {
    ...(emirate ? { emirate } : {}),
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

  const items: ClientListItem[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    nameAr: c.nameAr,
    slug: c.slug,
    emirate: c.emirate,
    servicesCount: asStringArray(c.services).length,
    website: c.website,
    contentCount: c._count.content,
    lastActivity: c.content[0]?.createdAt ?? c.updatedAt,
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
  const client = await db.client.findUnique({ where: { id } })
  if (!client) return null
  const brandSpecs = asRecord(client.brandSpecs)
  const brandColors = asRecord(client.brandColors)
  return {
    id: client.id,
    name: client.name,
    nameAr: client.nameAr,
    slug: client.slug,
    emirate: client.emirate,
    emiratesServed: asStringArray(client.emiratesServed),
    areas: asStringArray(client.areas),
    services: asStringArray(client.services),
    phone: client.phone,
    whatsapp: client.whatsapp,
    website: client.website,
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
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  }
}

export type ClientDetail = NonNullable<Awaited<ReturnType<typeof getClient>>>

export async function getClientContentStats(clientId: string) {
  const [byType, recent, total] = await Promise.all([
    db.generatedContent.groupBy({ by: ["type"], where: { clientId }, _count: { _all: true } }),
    db.generatedContent.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 5 }),
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
  })
}
