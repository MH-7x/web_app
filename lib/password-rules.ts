/** Password rules with no dependencies, so the browser forms and the API check exactly the same thing. */

const MAX_BYTES = 72 // bcrypt ignores everything past this

/** An error message for a bad password, or null when it is acceptable. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password === "") return "Enter a password."
  if (password.length < 8) return "Password must be at least 8 characters."
  if (new TextEncoder().encode(password).length > MAX_BYTES) return "Password must be at most 72 characters."
  if (!/[a-z]/.test(password)) return "Password needs at least one lowercase letter."
  if (!/[A-Z]/.test(password)) return "Password needs at least one uppercase letter."
  if (!/[0-9]/.test(password)) return "Password needs at least one number."
  return null
}

/** 0 (empty) to 4 (strong), for the strength meter. Only a guide: validatePassword is the rule. */
export function passwordStrength(password: string): number {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password) || password.length >= 14) score++
  return score
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function validateEmail(email: string): string | null {
  if (!email) return "Enter an email address."
  if (email.length > 254 || !EMAIL.test(email)) return "Enter a valid email address."
  return null
}

export function validateName(name: string): string | null {
  if (!name) return "Enter a name."
  if (name.length > 100) return "Name must be at most 100 characters."
  return null
}
