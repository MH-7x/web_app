import bcrypt from "bcryptjs"

export { validatePassword } from "@/lib/password-rules"

const ROUNDS = 12

export function hashPassword(password: string) {
  return bcrypt.hash(password, ROUNDS)
}

export function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

let dummy: Promise<string> | undefined

/**
 * Compare against a throwaway hash. Used when the account does not exist so a wrong email takes as long as a wrong
 * password and the response time does not give the email away.
 */
export async function compareAgainstDummy(password: string) {
  dummy ??= hashPassword("not-a-real-password")
  await bcrypt.compare(password, await dummy)
  return false
}
