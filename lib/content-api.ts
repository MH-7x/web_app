import { NextResponse } from "next/server"

import { getClient, type ClientDetail } from "@/lib/clients"
import {
  BadRequestError,
  parseLanguage,
  parseOptions,
  toColumns,
  type ContentType,
  type Language,
  type OptionsMap,
  type ResultMap,
} from "@/lib/content-types"
import { db } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import { GeminiError, getModelName } from "@/lib/gemini"

export type GenerateResponse<T extends ContentType = ContentType> = {
  id: string
  type: T
  language: Language
  result: ResultMap[T]
  createdAt: string
}

export type ErrorResponse = { error: string }

const fail = (error: string, status: number) => NextResponse.json<ErrorResponse>({ error }, { status })

const SUBTYPE: { [K in ContentType]: (options: OptionsMap[K]) => string | null } = {
  gbp: () => null,
  faq: (o) => o.topic || null,
  blog: (o) => o.topic,
  meta: () => null,
}

/**
 * Shared body of the POST /api/content/* routes:
 * validate -> load the client -> generate -> save to GeneratedContent -> respond.
 */
export async function handleGenerate<T extends ContentType>(
  request: Request,
  type: T,
  generate: (client: ClientDetail, language: Language, options: OptionsMap[T]) => Promise<ResultMap[T]>
) {
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
    const options = parseOptions(type, b.options)

    const client = await getClient(b.clientId)
    if (!client) return fail("That client no longer exists.", 404)

    const result = await generate(client, language, options)

    const saved = await db.generatedContent.create({
      data: {
        clientId: client.id,
        type,
        subtype: SUBTYPE[type](options as never),
        language,
        ...toColumns(type, result),
        metadata: { options, model: await getModelName(), result } as unknown as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json<GenerateResponse<T>>({
      id: saved.id,
      type,
      language,
      result,
      createdAt: saved.createdAt.toISOString(),
    })
  } catch (error) {
    if (error instanceof BadRequestError) return fail(error.message, 400)
    if (error instanceof GeminiError) return fail(error.message, error.status)
    console.error(`[content/${type}]`, error)
    return fail("Something went wrong while generating. Please try again.", 500)
  }
}
