import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIResponseError,
  type ResponseSchema,
} from "@google/generative-ai"

/** gemini-2.5-pro unless GEMINI_MODEL in .env overrides it (e.g. when the account has lost access to a model). */
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-pro"

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

/** Shared Google Generative AI client. Follows GEMINI_API_KEY, so a key changed in Settings applies at once. */
export function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new GeminiError("missing_key", "GEMINI_API_KEY is not set. Add it in Settings or in your .env file.", 500)
  }
  if (!client || clientKey !== apiKey) {
    client = new GoogleGenerativeAI(apiKey)
    clientKey = apiKey
  }
  return client
}

type ModelOptions = {
  systemInstruction?: string
  json?: { schema: ResponseSchema }
  temperature?: number
}

/** A gemini-2.5-pro model instance. */
export function getGeminiModel({ systemInstruction, json, temperature }: ModelOptions = {}) {
  return getGeminiClient().getGenerativeModel(
    {
      model: GEMINI_MODEL,
      ...(systemInstruction ? { systemInstruction } : {}),
      generationConfig: {
        ...(temperature !== undefined ? { temperature } : {}),
        ...(json ? { responseMimeType: "application/json", responseSchema: json.schema } : {}),
      },
    },
    { timeout: REQUEST_TIMEOUT_MS }
  )
}

/** Turn whatever the SDK threw into a GeminiError. */
function classify(error: unknown): GeminiError {
  if (error instanceof GeminiError) return error

  if (error instanceof GoogleGenerativeAIFetchError) {
    const { status } = error
    if (status === 404) {
      return new GeminiError("model_unavailable", `${GEMINI_MODEL} is not available for this API key. Set GEMINI_MODEL in .env to a model your key can use, then restart the server.`, 502)
    }
    // a daily quota will not recover by retrying, so fail fast with an actionable message
    if (status === 429 && /PerDay/i.test(JSON.stringify(error.errorDetails ?? []) + error.message)) {
      return new GeminiError("quota_exhausted", `The daily Gemini quota for ${GEMINI_MODEL} is used up on this API key (free tier). Enable billing on the key's Google project, or set GEMINI_MODEL in .env to a different model.`, 429)
    }
    if (status === 429) return new GeminiError("rate_limited", "Gemini is rate limiting requests. Wait a moment and try again.", 429, true)
    if (status === 401 || status === 403 || (status === 400 && /api key/i.test(error.message))) {
      return new GeminiError("invalid_key", "Gemini rejected the API key. Check GEMINI_API_KEY in your .env file.", 502)
    }
    if (status !== undefined && status >= 500) {
      return new GeminiError("unavailable", "Gemini is temporarily unavailable. Try again shortly.", 503, true)
    }
    return new GeminiError("unknown", `Gemini request failed (${status ?? "unknown status"}).`, 502)
  }

  if (error instanceof GoogleGenerativeAIResponseError) {
    return new GeminiError("blocked", "Gemini declined to answer this request. Adjust the inputs and try again.", 422)
  }

  const message = error instanceof Error ? error.message : String(error)
  // network drop, DNS failure, our own timeout
  if (/fetch failed|network|timed? ?out|abort|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return new GeminiError("unavailable", "Could not reach Gemini. Check your connection and try again.", 503, true)
  }
  return new GeminiError("unknown", "Something went wrong while talking to Gemini.", 500)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Run `fn`, retrying transient failures with exponential backoff and jitter. */
export async function withRetry<T>(fn: () => Promise<T>, { retries = MAX_RETRIES }: { retries?: number } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const failure = classify(error)
      if (!failure.retryable || attempt >= retries) {
        console.error(`[gemini] ${failure.code}:`, error instanceof Error ? error.message : error)
        throw failure
      }
      await sleep(BASE_DELAY_MS * 2 ** attempt + Math.random() * 250)
    }
  }
}

type GenerateOptions = { systemInstruction?: string; temperature?: number }

/** One-shot text generation. */
export async function generateText(prompt: string, { systemInstruction, temperature }: GenerateOptions = {}) {
  return withRetry(async () => {
    const result = await getGeminiModel({ systemInstruction, temperature }).generateContent(prompt)
    const text = result.response.text().trim()
    // an empty body is a transient hiccup, worth another try
    if (!text) throw new GeminiError("bad_response", "Gemini returned an empty response.", 502, true)
    return text
  })
}

/** One-shot generation constrained to a JSON schema; returns the parsed value. */
export async function generateJSON<T>(prompt: string, schema: ResponseSchema, { systemInstruction, temperature }: GenerateOptions = {}) {
  return withRetry(async () => {
    const result = await getGeminiModel({ systemInstruction, temperature, json: { schema } }).generateContent(prompt)
    const text = result.response.text().trim()
    try {
      return JSON.parse(text) as T
    } catch {
      throw new GeminiError("bad_response", "Gemini returned malformed data. Try again.", 502, true)
    }
  })
}
