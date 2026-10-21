import { handleGenerate } from "@/lib/content-api"
import { generateBlog } from "@/lib/generators/content"

export function POST(request: Request) {
  return handleGenerate(request, "blog", generateBlog)
}
