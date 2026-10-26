import { DEFAULT_BUSINESS, type BusinessSettings } from "@/lib/business-types"
import { db } from "@/lib/db"

const KEYS: (keyof BusinessSettings)[] = ["businessName", "tagline", "terms", "phone", "email", "website"]

export async function getBusinessSettings(): Promise<BusinessSettings> {
  const rows = await db.setting.findMany({ where: { key: { in: KEYS.map((k) => `business.${k}`) } } })
  const stored = new Map(rows.map((r) => [r.key, r.value]))
  return Object.fromEntries(KEYS.map((k) => [k, stored.get(`business.${k}`) ?? DEFAULT_BUSINESS[k]])) as BusinessSettings
}

export async function saveBusinessSettings(next: BusinessSettings) {
  await db.$transaction(
    KEYS.map((k) => db.setting.upsert({ where: { key: `business.${k}` }, create: { key: `business.${k}`, value: next[k] }, update: { value: next[k] } }))
  )
  return getBusinessSettings()
}
