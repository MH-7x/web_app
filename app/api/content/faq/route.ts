import { handleGenerate } from "@/lib/content-api"
import { generateFAQ } from "@/lib/generators/content"

export function POST(request: Request) {
  return handleGenerate(request, "faq", generateFAQ)
}
