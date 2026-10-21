import { handleFacebook } from "@/lib/ads-api"

export function POST(request: Request) {
  return handleFacebook(request)
}
