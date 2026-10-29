import { handleGenerate } from "@/lib/content-api"
import { generateMeta } from "@/lib/generators/content"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return handleGenerate(request, "meta", generateMeta)
}
