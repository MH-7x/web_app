import { handleGenerate } from "@/lib/content-api"
import { generateGBP } from "@/lib/generators/content"

export function POST(request: Request) {
  return handleGenerate(request, "gbp", generateGBP)
}
