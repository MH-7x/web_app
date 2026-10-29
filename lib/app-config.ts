import { db } from "@/lib/db"
import { decryptSecret, encryptSecret } from "@/lib/secret-box"

/**
 * Settings that can be changed from the app (Settings → API Keys). They are stored in the database, because a deployed
 * server cannot write its own .env file. What is saved in the app wins; if nothing is saved, the environment variable
 * (for example one set in the Vercel dashboard) is used. The key is stored encrypted.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"

const KEY_SETTING = "secret.GEMINI_API_KEY"
const MODEL_SETTING = "config.GEMINI_MODEL"

export async function getGeminiConfig(): Promise<{ apiKey: string | undefined; model: string }> {
  const rows = await db.setting.findMany({ where: { key: { in: [KEY_SETTING, MODEL_SETTING] } } })
  const stored = new Map(rows.map((r) => [r.key, r.value]))

  let apiKey: string | undefined
  const box = stored.get(KEY_SETTING)
  if (box) {
    apiKey = decryptSecret(box) ?? undefined
    if (!apiKey) console.error("[app-config] the saved Gemini key cannot be decrypted (was JWT_SECRET changed?). Enter it again in Settings.")
  }
  apiKey ||= process.env.GEMINI_API_KEY?.trim() || undefined

  const model = stored.get(MODEL_SETTING)?.trim() || process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
  return { apiKey, model }
}

export async function getGeminiApiKey() {
  return (await getGeminiConfig()).apiKey
}

export async function getModelName() {
  return (await getGeminiConfig()).model
}

export async function saveGeminiApiKey(key: string) {
  const value = encryptSecret(key)
  await db.setting.upsert({ where: { key: KEY_SETTING }, create: { key: KEY_SETTING, value }, update: { value } })
}

export async function saveGeminiModel(model: string) {
  await db.setting.upsert({ where: { key: MODEL_SETTING }, create: { key: MODEL_SETTING, value: model }, update: { value: model } })
}

/** Show enough of a secret to recognise it, never all of it. */
export function maskSecret(value: string | undefined) {
  if (!value) return null
  if (value.length < 12) return "••••••••"
  return `${value.slice(0, 4)}${"•".repeat(Math.min(24, value.length - 8))}${value.slice(-4)}`
}
