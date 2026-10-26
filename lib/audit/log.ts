import type { LogEntry, LogLevel } from "@/lib/audit/types"

/** Called by the crawler, checks and speed tests for every step worth showing in the audit log. */
export type AuditLogger = (level: LogLevel, message: string) => void

/**
 * Turn URL-encoded text back into readable text, so /%d9%86%d9%82%d9%84 reads /نقل.
 * A multi-byte character is several %XX escapes in a row, and each one alone is invalid UTF-8,
 * so decode whole runs of escapes; a run that is not valid is kept as it was.
 */
export function decodeLogText(message: string) {
  return message.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run)
    } catch {
      return run
    }
  })
}

export const logEntry = (level: LogLevel, message: string): LogEntry => ({ timestamp: Date.now(), level, message: decodeLogText(message) })
