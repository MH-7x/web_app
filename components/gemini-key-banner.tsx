import { TriangleAlert } from "lucide-react"
import Link from "next/link"
import { connection } from "next/server"

/** Persistent notice on every Gemini-powered module while no API key is configured. Read per request so a key saved in Settings clears it at once. */
export async function GeminiKeyBanner() {
  await connection()
  if (process.env.GEMINI_API_KEY) return null
  return (
    <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      <span>
        Set your Gemini API key in{" "}
        <Link href="/settings" className="font-medium underline underline-offset-2">
          Settings
        </Link>{" "}
        to use this feature.
      </span>
    </div>
  )
}
