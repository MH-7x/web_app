import { NextResponse } from "next/server"

import { adsColumns, parseFacebookRequest, type AdsResultMap } from "@/lib/ads-types"
import { getClient, type ClientDetail } from "@/lib/clients"
import { BadRequestError, parseLanguage, type Language } from "@/lib/content-types"
import { db } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import { GeminiError, getModelName } from "@/lib/gemini"
import { generateFacebookAds } from "@/lib/generators/ads"

export type AdsResponse = {
  id: string
  type: "fb-ad"
  language: Language
  result: AdsResultMap["fb-ad"]
  createdAt: string
}

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

/** Emirates a client can run ads in: where it is based plus the others it serves. */
export const clientEmirates = (client: ClientDetail) => [client.emirate, ...client.emiratesServed.filter((e) => e !== client.emirate)]

/** validate -> load the client -> generate -> save to GeneratedContent -> respond (same flow as the Content routes). */
export async function handleFacebook(request: Request) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new BadRequestError("Request body must be JSON.")
    }
    const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
    if (typeof b.clientId !== "string" || !b.clientId) throw new BadRequestError("Select a client first.")
    const language = parseLanguage(b.language)

    const client = await getClient(b.clientId)
    if (!client) return fail("That client no longer exists.", 404)

    const req = parseFacebookRequest(b, clientEmirates(client))
    const result = await generateFacebookAds(client, language, req)

    const saved = await db.generatedContent.create({
      data: {
        clientId: client.id,
        type: "fb-ad",
        subtype: `${req.objective} · ${req.emirates.length > 1 ? "all emirates" : req.emirates[0]}`,
        language,
        ...adsColumns(result),
        metadata: { request: req, model: getModelName(), result } as unknown as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json<AdsResponse>({ id: saved.id, type: "fb-ad", language, result, createdAt: saved.createdAt.toISOString() })
  } catch (error) {
    if (error instanceof BadRequestError) return fail(error.message, 400)
    if (error instanceof GeminiError) return fail(error.message, error.status)
    console.error("[ads/fb-ad]", error)
    return fail("Something went wrong while generating. Please try again.", 500)
  }
}
