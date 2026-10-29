export const SECURITY_QUESTIONS = [
  "What city were you born in?",
  "What is your mother's name?",
  "What was your first school?",
  "What is your pet's name?",
  "What is your favorite book?",
] as const

/** Answers are compared case- and whitespace-insensitively, so "  Dubai " matches "dubai". */
export const normalizeAnswer = (answer: string) => answer.trim().toLowerCase().replace(/\s+/g, " ")

/**
 * The question shown for an email that has no account (or no question). It is picked from the email itself, so asking
 * twice gives the same one and the forgot-password form does not reveal which emails are registered.
 */
export function decoyQuestion(email: string) {
  let h = 0
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return SECURITY_QUESTIONS[h % SECURITY_QUESTIONS.length]
}
