import { listAllClients } from "@/lib/clients"
import { asStringArray, displayDomain, formatPhone } from "@/lib/client-schema"

const cell = (value: string) => {
  // neutralise spreadsheet formula injection, then CSV-quote
  const safe = /^[=+\-@\t\r]/.test(value) && !/^\+[\d ]+$/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const clients = await listAllClients({
    q: searchParams.get("q") ?? undefined,
    emirate: searchParams.get("emirate") ?? undefined,
  })

  const header = ["Name", "Name (Arabic)", "Emirate", "Other Emirates Served", "Areas", "Services", "Phone", "WhatsApp", "Website", "Created"]
  const rows = clients.map((c) => [
    c.name,
    c.nameAr,
    c.emirate,
    asStringArray(c.emiratesServed).join("; "),
    asStringArray(c.areas).join("; "),
    asStringArray(c.services).join("; "),
    formatPhone(c.phone),
    formatPhone(c.whatsapp),
    displayDomain(c.website),
    c.createdAt.toISOString().slice(0, 10),
  ])

  // BOM so Excel reads the Arabic column as UTF-8
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="clients.csv"',
    },
  })
}
