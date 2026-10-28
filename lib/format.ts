/** "2h ago" style relative time. Server-side only: depends on the current time. */
export function timeAgo(date: Date, now = new Date()) {
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** True when most of the letters in `text` are Arabic script, so a container can switch to dir="rtl". */
export function isArabic(text: string) {
  const letters = text.match(/\p{L}/gu)
  if (!letters) return false
  const arabic = letters.filter((c) => /\p{Script=Arabic}/u.test(c)).length
  return arabic > letters.length / 2
}
