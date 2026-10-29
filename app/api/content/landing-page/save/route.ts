import { NextResponse } from "next/server"

import { getClient } from "@/lib/clients"
import { BadRequestError, parseLanguage } from "@/lib/content-types"
import { db } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import { getModelName } from "@/lib/gemini"
import { fail, handleError, readJson } from "@/lib/gbp-posts-api"
import { landingMarkdown, normalizeLandingResult, parseLandingOptions } from "@/lib/landing-page-types"
import { getSession } from "@/lib/auth"

/**
 * Save a generated landing page to the client's content history. Send the `id` from an earlier save to
 * update that item instead of adding a second one (the user edited the page after saving it).
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await readJson(request)
    if (typeof body.clientId !== "string" || !body.clientId) throw new BadRequestError("Select a client first.")
    const language = parseLanguage(body.language)
    const options = parseLandingOptions(body.options)
    const result = normalizeLandingResult(body.result)
    if (!result) throw new BadRequestError("The landing page is not in the expected format.")

    const client = await getClient(body.clientId)
    if (!client) return fail("That client no longer exists.", 404)

    const en = result.en ? landingMarkdown(result.en) : null
    const ar = result.ar ? landingMarkdown(result.ar) : null
    const data = {
      language,
      subtype: options.primaryKeyword,
      content: en ?? ar ?? "",
      contentAr: en !== null ? ar : null,
      metadata: { options, model: getModelName(), result } as unknown as Prisma.InputJsonValue,
    }

    if (typeof body.id === "string" && body.id) {
      const existing = await db.generatedContent.findUnique({ where: { id: body.id }, select: { clientId: true, type: true } })
      if (existing && existing.clientId === client.id && existing.type === "landing") {
        await db.generatedContent.update({ where: { id: body.id }, data })
        return NextResponse.json({ id: body.id })
      }
    }

    const saved = await db.generatedContent.create({ data: { clientId: client.id, type: "landing", ...data } })
    return NextResponse.json({ id: saved.id }, { status: 201 })
  } catch (error) {
    return handleError(error, "content/landing-page/save")
  }
}
