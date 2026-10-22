import { NextResponse } from "next/server"

import { BadRequestError } from "@/lib/content-types"
import { db } from "@/lib/db"
import { freshConnection, publishPost } from "@/lib/gbp-api"
import { toPostDTO } from "@/lib/gbp-posts"
import { handleError, fail, readJson } from "@/lib/gbp-posts-api"
import { GBP_POST_MAX } from "@/lib/gbp-posts-types"

/** First sentence of the post, short enough for the title Offer and Event posts require. */
const titleOf = (text: string) => {
  const sentence = text.split(/(?<=[.!?؟])\s/)[0].trim()
  return sentence.length <= 58 ? sentence : `${sentence.slice(0, 55).trimEnd()}...`
}

/**
 * Publish one post to the client's Google Business Profile: `{ id, lang? }`.
 * Google posts are one language each, so a bilingual post goes out in `lang` (default: Arabic, the primary version).
 */
export async function POST(request: Request) {
  try {
    const b = await readJson(request)
    if (typeof b.id !== "string" || !b.id) throw new BadRequestError("Missing post id.")

    const post = await db.gBPPost.findUnique({ where: { id: b.id }, include: { client: { select: { website: true } } } })
    if (!post) return fail("That post no longer exists.", 404)
    if (post.status === "published") return fail("This post has already been published.", 409)

    const connection = await db.gBPConnection.findUnique({ where: { clientId: post.clientId } })
    if (!connection?.connected) return fail("This client is not connected to Google Business Profile. Connect it from the client's Settings tab.", 409)

    const hasAr = post.language !== "en" && post.textAr.trim() !== ""
    const hasEn = post.language !== "ar" && post.textEn.trim() !== ""
    const lang = b.lang === "ar" || b.lang === "en" ? b.lang : hasAr ? "ar" : "en"
    if ((lang === "ar" && !hasAr) || (lang === "en" && !hasEn)) throw new BadRequestError(`This post has no ${lang === "ar" ? "Arabic" : "English"} version.`)
    const summary = (lang === "ar" ? post.textAr : post.textEn).trim()
    if (summary.length > GBP_POST_MAX) throw new BadRequestError(`The post is over Google's ${GBP_POST_MAX} character limit.`)
    if (post.imageUrl && !/^https:\/\//i.test(post.imageUrl)) throw new BadRequestError("The image URL must be a public https link.")

    const ready = await freshConnection(connection)
    const { id: gbpPostId } = await publishPost(ready, {
      summary,
      languageCode: lang,
      postType: post.postType,
      cta: post.cta,
      websiteUrl: post.client.website,
      imageUrl: post.imageUrl,
      title: titleOf(summary),
    })

    const updated = await db.gBPPost.update({ where: { id: post.id }, data: { status: "published", publishedAt: new Date(), gbpPostId } })
    return NextResponse.json({ post: toPostDTO(updated) })
  } catch (error) {
    return handleError(error, "gbp-posts/publish")
  }
}
