import { handleGenerate } from "@/lib/content-api"
import { generateMeta } from "@/lib/generators/content"

export function POST(request: Request) {
  return handleGenerate(request, "meta", generateMeta)
}
