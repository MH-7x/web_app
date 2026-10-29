import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"

/**
 * Encrypts secrets (like the Gemini API key) before they go into the database, so a copy of the database alone does not
 * reveal them. AES-256-GCM; the key is derived from JWT_SECRET, so no extra variable has to be managed. The catch:
 * changing JWT_SECRET makes stored secrets unreadable, and they have to be entered again in Settings.
 */
function key() {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET is missing or too short, so stored secrets cannot be encrypted.")
  return Buffer.from(hkdfSync("sha256", secret, "", "mhub-stored-secrets-v1", 32))
}

/** "v1.<iv>.<tag>.<ciphertext>", each part base64url. */
export function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".")
}

/** The original text, or null if the value was not encrypted with the current JWT_SECRET (or was tampered with). */
export function decryptSecret(box: string): string | null {
  try {
    const [version, iv, tag, data] = box.split(".")
    if (version !== "v1" || !iv || !tag || !data) return null
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}
