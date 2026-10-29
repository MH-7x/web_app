import { NextResponse } from "next/server"

import { getClient } from "@/lib/clients"
import { db } from "@/lib/db"
import { toPostDTO } from "@/lib/gbp-posts"
import { fail, handleError } from "@/lib/gbp-posts-api"
import { asStringArray } from "@/lib/client-schema"
import { dateKey, POST_CATEGORIES, type PostCategory, type PostLanguage } from "@/lib/gbp-posts-types"
import { regeneratePost } from "@/lib/generators/gbp-posts"
import { getCategoryFallbackServices } from "@/lib/prompts/templates"
import { getSession } from "@/lib/auth"

/** New text and image prompt for one post; its day and angle stay. It goes back to draft. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { id } = await params
    const row = await db.gBPPost.findUnique({ where: { id } })
    if (!row) return fail("That post no longer exists.", 404)
    // rewriting a live post would drop it back to draft and lose its link to the Google post
    if (row.status === "published") return fail("This post is already published on Google Business Profile.", 409)
    const client = await getClient(row.clientId)
    if (!client) return fail("That client no longer exists.", 404)

    const category = (POST_CATEGORIES.find((c) => c.id === row.category)?.id ?? "service-highlight") as PostCategory
    const index = Math.floor(row.createdAt.getTime() / 1000) % Math.max(1, client.services.length)
    const language: PostLanguage = row.language === "en" || row.language === "ar" ? row.language : "both"
    const next = await regeneratePost(
      client,
      {
        date: dateKey(row.scheduledDate),
        category,
        service: client.services[index] ?? getCategoryFallbackServices(client.category),
        area: client.areas[index % Math.max(1, client.areas.length)] ?? client.emirate,
        keywords: asStringArray(row.keywords),
      },
      language
    )

    const updated = await db.gBPPost.update({
      where: { id },
      data: { textAr: next.textAr, textEn: next.textEn, cta: next.cta, imagePrompt: next.imagePrompt, status: "draft" },
    })
    return NextResponse.json({ post: toPostDTO(updated) })
  } catch (error) {
    return handleError(error, "gbp-posts/regenerate")
  }
}
