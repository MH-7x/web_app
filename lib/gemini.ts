import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIResponseError,
  type ResponseSchema,
} from "@google/generative-ai"

import { getGeminiConfig, getModelName } from "@/lib/app-config"

// the key and model come from Settings (stored in the database), else the environment: see lib/app-config.ts
export { DEFAULT_GEMINI_MODEL, getModelName } from "@/lib/app-config"

const REQUEST_TIMEOUT_MS = 120_000
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1_000

export type GeminiErrorCode =
  | "missing_key"
  | "invalid_key"
  | "model_unavailable"
  | "rate_limited"
  | "quota_exhausted"
  | "unavailable"
  | "blocked"
  | "bad_response"
  | "unknown"

/** An error whose message is safe to show to the user. */
export class GeminiError extends Error {
  constructor(
    public code: GeminiErrorCode,
    message: string,
    /** HTTP status a route handler should answer with. */
    public status: number,
    public retryable = false
  ) {
    super(message)
    this.name = "GeminiError"
  }
}

let client: GoogleGenerativeAI | undefined
let clientKey: string | undefined


type ModelOptions = {
  systemInstruction?: string
  json?: { schema: ResponseSchema }
  temperature?: number
  /** per request, for long generations that need more than the default */
  timeoutMs?: number
}

/** A model instance for the configured key and model. Looked up on every call, so a change in Settings applies at once. */
export async function getGeminiModel({ systemInstruction, json, temperature, timeoutMs }: ModelOptions = {}) {
  const { apiKey, model } = await getGeminiConfig()
  if (!apiKey) {
    throw new GeminiError("missing_key", "Gemini API key not configured. Set it in Settings → API Keys.", 503)
  }
  if (!client || clientKey !== apiKey) {
    client = new GoogleGenerativeAI(apiKey)
    clientKey = apiKey
  }
  return client.getGenerativeModel(
    {
      model,
      ...(systemInstruction ? { systemInstruction } : {}),
      generationConfig: {
        ...(temperature !== undefined ? { temperature } : {}),
        ...(json ? { responseMimeType: "application/json", responseSchema: json.schema } : {}),
      },
    },
    { timeout: timeoutMs ?? REQUEST_TIMEOUT_MS }
  )
}

/** Turn whatever the SDK threw into a GeminiError. */
async function classify(error: unknown): Promise<GeminiError> {
  if (error instanceof GeminiError) return error

  if (error instanceof GoogleGenerativeAIFetchError) {
    const { status } = error
    if (status === 404) {
      return new GeminiError("model_unavailable", `${await getModelName()} is not available for this API key. Pick a model your key can use in Settings → API Keys.`, 502)
    }
    // a daily quota will not recover by retrying, so fail fast with an actionable message
    if (status === 429 && /PerDay/i.test(JSON.stringify(error.errorDetails ?? []) + error.message)) {
      return new GeminiError("quota_exhausted", `The daily Gemini quota for ${await getModelName()} is used up on this API key (free tier). Enable billing on the key's Google project, or pick a different model in Settings → API Keys.`, 429)
    }
    if (status === 429) return new GeminiError("rate_limited", "Rate limited. Wait a moment and try again.", 429, true)
    if (status === 401 || status === 403 || (status === 400 && /api key/i.test(error.message))) {
      return new GeminiError("invalid_key", "Gemini rejected the API key. Check it in Settings → API Keys.", 502)
    }
    if (status !== undefined && status >= 500) {
      return new GeminiError("unavailable", "Gemini is temporarily unavailable. Try again shortly.", 503, true)
    }
    return new GeminiError("unknown", `Gemini request failed (${status ?? "unknown status"}).`, 502)
  }

  if (error instanceof GoogleGenerativeAIResponseError) {
    return new GeminiError("blocked", "Generation failed. Try again or adjust your prompt.", 422)
  }

  const message = error instanceof Error ? error.message : String(error)
  // network drop, DNS failure, our own timeout
  if (/fetch failed|network|timed? ?out|abort|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return new GeminiError("unavailable", "Could not reach Gemini. Check your connection and try again.", 503, true)
  }
  return new GeminiError("unknown", "Something went wrong while talking to Gemini.", 500)
}

/** Strip the usual prompt-injection patterns (fake role tags, "ignore previous instructions") from a prompt before it is sent. */
export function sanitizePrompt(text: string) {
  return text
    .replace(/<\s*(system|assistant|developer)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(system|assistant|developer)\b[^>]*>/gi, "")
    .replace(/\b(?:ignore|disregard|forget)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier)\b[^.\n]{0,40}\b(?:instructions?|prompts?|rules?|messages?)\b[^.\n]*/gi, "")
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Run `fn`, retrying transient failures with exponential backoff and jitter. */
export async function withRetry<T>(fn: () => Promise<T>, { retries = MAX_RETRIES }: { retries?: number } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const failure = await classify(error)
      if (!failure.retryable || attempt >= retries) {
        console.error(`[gemini] ${failure.code}:`, error instanceof Error ? error.message : error)
        throw failure
      }
      await sleep(BASE_DELAY_MS * 2 ** attempt + Math.random() * 250)
    }
  }
}

type GenerateOptions = { systemInstruction?: string; temperature?: number; timeoutMs?: number; retries?: number }

/** One-shot text generation. */
export async function generateText(prompt: string, { systemInstruction, temperature, timeoutMs, retries }: GenerateOptions = {}) {
  return withRetry(async () => {
    const result = await (await getGeminiModel({ systemInstruction, temperature, timeoutMs })).generateContent(sanitizePrompt(prompt))
    const text = result.response.text().trim()
    // an empty body is a transient hiccup, worth another try
    if (!text) throw new GeminiError("bad_response", "Generation failed. Try again or adjust your prompt.", 502, true)
    return text
  }, retries === undefined ? undefined : { retries })
}

/** One-shot generation constrained to a JSON schema; returns the parsed value. */
export async function generateJSON<T>(prompt: string, schema: ResponseSchema, { systemInstruction, temperature }: GenerateOptions = {}) {
  return withRetry(async () => {
    const result = await (await getGeminiModel({ systemInstruction, temperature, json: { schema } })).generateContent(sanitizePrompt(prompt))
    const text = result.response.text().trim()
    try {
      return JSON.parse(text) as T
    } catch {
      throw new GeminiError("bad_response", "Generation failed. Try again or adjust your prompt.", 502, true)
    }
  })
}
