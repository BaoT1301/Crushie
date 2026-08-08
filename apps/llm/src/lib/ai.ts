/**
 * AI client (OpenAI).
 *
 * Replaces lib/gemini.ts + lib/azure-client.ts + lib/llm-client.ts.
 *
 * The exported function names and signatures are unchanged from the Gemini
 * adapter on purpose, so the seven route files consuming them did not need to
 * be rewritten. Only their import path moved.
 *
 * Three things improved in the move, all of them audit findings:
 *
 *  - Timeouts. The old Gemini/Azure calls passed no AbortSignal at all, so a
 *    hanging upstream held an Express request (and the tRPC request above it)
 *    open indefinitely with no circuit breaker.
 *  - Retry branching. The old logic retried up to 3x on ANY thrown error,
 *    including 401 invalid-key and 429 quota-exceeded, where retrying cannot
 *    help and simply burns more quota. Terminal errors now fail fast.
 *  - Structured JSON. Most of the old markdown-fence stripping existed to work
 *    around Gemini wrapping JSON in ```json blocks. response_format json_object
 *    makes that unnecessary, though the salvage parser is kept as a backstop.
 */

import OpenAI from "openai";

let client: OpenAI | null = null;

/** Main model. Override per deployment without touching code. */
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

/**
 * Cheaper model for high-frequency calls. The realtime coach sends webcam
 * frames continuously, so running it on the main model is the single largest
 * avoidable cost on this service.
 */
const FAST_MODEL = process.env.OPENAI_FAST_MODEL || "gpt-4o-mini";

/**
 * Embedding model for vibe-profile similarity search.
 *
 * text-embedding-3-small outputs 1536 dimensions, which is what
 * `vibe_profiles.embedding` is declared as (`vector(1536)`) and what the
 * ivfflat index in 00002 was built for. Changing this model means changing the
 * column type and rebuilding the index and every stored vector — vectors from
 * different models are not comparable, so a mixed table silently returns
 * nonsense similarities rather than failing.
 */
const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

export const EMBEDDING_DIMENSIONS = 1536;

const REQUEST_TIMEOUT_MS = parseInt(
  process.env.OPENAI_TIMEOUT_MS || "60000",
  10,
);

const DEFAULT_JSON_RETRIES = 3;
const RETRY_BASE_MS = 1000;

/**
 * Hard ceiling on output tokens per completion.
 *
 * None of these calls set a limit before, which mattered more than it looks:
 * the JSON helpers retry up to DEFAULT_JSON_RETRIES times, and the retry prompt
 * asks the model to "regenerate the FULL response from scratch", so one badly
 * behaved response could bill four unbounded completions. Output tokens are the
 * expensive half of the bill.
 *
 * The values are generous enough not to truncate legitimate answers — the
 * analyzer returns the largest payload by a wide margin — and are per-call
 * rather than global so the cheap, high-frequency coach is not held to the same
 * ceiling as a full profile analysis.
 */
const MAX_TOKENS_DEFAULT = 2048;
const MAX_TOKENS_JSON = 4096;
const MAX_TOKENS_FAST = 512;

function getClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
  return client;
}

// ============================================================================
// Image helpers
// ============================================================================

export type ImageInput = {
  /** Base64-encoded image data (no data: prefix) */
  base64: string;
  /** MIME type, e.g. "image/jpeg", "image/png", "image/webp" */
  mimeType: string;
};

/** OpenAI takes images as data URIs rather than Gemini's inlineData part. */
function toImagePart(img: ImageInput) {
  return {
    type: "image_url" as const,
    image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
  };
}

// ============================================================================
// Error classification
// ============================================================================

/**
 * True when retrying could plausibly succeed.
 *
 * 401/403 mean the key is wrong, 400/422 mean the request is malformed, and
 * 429 means quota is already exhausted. Retrying any of those is pure waste,
 * which is exactly what the previous implementation did three times over.
 */
function isRetryable(err: unknown): boolean {
  // Refusals are deterministic. Retrying the identical request three times
  // produces the identical refusal and three times the cost.
  if (err instanceof ModelRefusalError) return false;

  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status?: number }).status
      : undefined;

  if (status === undefined) return true; // parse/network failures are worth a retry
  if (status === 429) return false;
  if (status >= 400 && status < 500) return false;
  return true;
}

/**
 * Pull the text out of a completion, surfacing refusals explicitly.
 *
 * OpenAI returns an empty `content` (and sometimes a populated `refusal`) when
 * a request trips a content policy. Reading content blindly turned that into
 * "Invalid JSON response: Unexpected end of JSON input. Raw length=0", which
 * looks like a parsing bug and sends you looking in the wrong place.
 *
 * The concrete case here is identity verification: OpenAI models decline
 * facial-comparison tasks, so /api/verify-identity can never succeed on this
 * provider no matter how the prompt is written.
 */
function extractContent(res: {
  choices: Array<{ message?: { content?: string | null; refusal?: string | null } }>;
}): string {
  const msg = res.choices[0]?.message;
  if (msg?.refusal) {
    throw new ModelRefusalError(msg.refusal);
  }
  const content = msg?.content ?? "";
  if (!content.trim()) {
    throw new ModelRefusalError(
      "Model returned an empty response, which usually means the request was declined on content-policy grounds.",
    );
  }
  return content;
}

/** Distinguishes a policy refusal from a transport or parsing failure. */
export class ModelRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRefusalError";
  }
}

// ============================================================================
// Text generation
// ============================================================================

export async function generateFromPrompt(
  prompt: string,
  model = MODEL,
): Promise<string> {
  const res = await getClient().chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: MAX_TOKENS_DEFAULT,
  });

  return extractContent(res);
}

export async function generateJSON<T = unknown>(
  prompt: string,
  model = MODEL,
): Promise<T> {
  const res = await getClient().chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    response_format: { type: "json_object" },
    max_tokens: MAX_TOKENS_JSON,
  });

  return parseJsonResponse<T>(extractContent(res));
}

// ============================================================================
// Multimodal generation
// ============================================================================

export async function generateFromMultimodal(
  prompt: string,
  images: ImageInput[],
  model = MODEL,
): Promise<string> {
  const res = await getClient().chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: [...images.map(toImagePart), { type: "text", text: prompt }],
      },
    ],
    temperature: 0.7,
    max_tokens: MAX_TOKENS_DEFAULT,
  });

  return extractContent(res);
}

export async function generateMultimodalJSON<T = unknown>(
  prompt: string,
  images: ImageInput[],
  retries = DEFAULT_JSON_RETRIES,
  model = MODEL,
): Promise<T> {
  return withRetry(retries, async (attempt, lastError) => {
    const adjusted =
      attempt === 0 ? prompt : buildRetryPrompt(prompt, lastError, attempt);

    const res = await getClient().chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            ...images.map(toImagePart),
            { type: "text", text: adjusted },
          ],
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
      // The realtime coach shares this path via generateFastMultimodalJSON but
      // returns a three-field object, so it does not need the analyzer's budget.
      max_tokens: model === FAST_MODEL ? MAX_TOKENS_FAST : MAX_TOKENS_JSON,
    });

    return parseJsonResponse<T>(extractContent(res));
  });
}

export async function generateJSONWithRetry<T = unknown>(
  prompt: string,
  retries = DEFAULT_JSON_RETRIES,
  model = MODEL,
): Promise<T> {
  return withRetry(retries, async (attempt, lastError) => {
    const adjusted =
      attempt === 0 ? prompt : buildRetryPrompt(prompt, lastError, attempt);

    const res = await getClient().chat.completions.create({
      model,
      messages: [{ role: "user", content: adjusted }],
      temperature: 0.7,
      response_format: { type: "json_object" },
      max_tokens: model === FAST_MODEL ? MAX_TOKENS_FAST : MAX_TOKENS_JSON,
    });

    return parseJsonResponse<T>(extractContent(res));
  });
}

/**
 * Convenience wrapper for the realtime coach, which runs on the cheap model.
 */
export async function generateFastMultimodalJSON<T = unknown>(
  prompt: string,
  images: ImageInput[],
  retries = 1,
): Promise<T> {
  return generateMultimodalJSON<T>(prompt, images, retries, FAST_MODEL);
}

// ============================================================================
// Shared helpers
// ============================================================================

async function withRetry<T>(
  retries: number,
  attemptFn: (attempt: number, lastError: Error | null) => Promise<T>,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await attemptFn(attempt, lastError);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Fail fast on bad key, bad request, or exhausted quota.
      if (!isRetryable(err)) throw lastError;

      if (attempt < retries) {
        await sleep(RETRY_BASE_MS * (attempt + 1));
      }
    }
  }

  throw lastError;
}

/** Strip markdown fences and parse. Kept as a backstop despite json_object. */
function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  const extracted = extractJsonCandidate(cleaned);

  try {
    return JSON.parse(extracted) as T;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown JSON parse error";
    throw new SyntaxError(
      `Invalid JSON response from OpenAI: ${message}. Raw length=${cleaned.length}`,
    );
  }
}

function extractJsonCandidate(text: string): string {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");

  let start = -1;
  if (objectStart === -1) start = arrayStart;
  else if (arrayStart === -1) start = objectStart;
  else start = Math.min(objectStart, arrayStart);

  if (start === -1) return text;

  const objectEnd = text.lastIndexOf("}");
  const arrayEnd = text.lastIndexOf("]");
  const end = Math.max(objectEnd, arrayEnd);

  if (end <= start) return text.slice(start);

  return text.slice(start, end + 1).trim();
}

function buildRetryPrompt(
  prompt: string,
  lastError: Error | null,
  attempt: number,
): string {
  const reason = lastError?.message ?? "Invalid JSON";

  return `${prompt}\n\nRETRY #${attempt}: The previous output could not be parsed as JSON (${reason}). Regenerate the FULL response from scratch as ONE complete valid JSON object. Do not include markdown fences or commentary. Keep string values concise.`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Embeddings
// ============================================================================

/**
 * Turn a vibe profile into a vector for similarity search.
 *
 * This is what makes matching work at all. `vibe_profiles.embedding` existed
 * from 00002 and every similarity query depended on it, but nothing in the
 * codebase ever wrote it — all four insert paths omitted the column. The
 * candidate query requires the caller's own embedding to be non-NULL, so it
 * short-circuited for every real user and Discover always reported "no
 * compatible profiles found".
 *
 * Embeddings are cheap (fractions of a cent) and deterministic for identical
 * input, so there is no retry ladder here: a failure should surface to the
 * caller rather than be silently retried into a bill.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const input = text.trim();

  if (!input) {
    throw new Error("Cannot embed empty text");
  }

  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  });

  const vector = res.data[0]?.embedding;

  if (!vector) {
    throw new Error("Embedding response contained no vector");
  }

  // A dimension mismatch would be accepted by pgvector's parser only to fail on
  // insert against vector(1536), several layers away from the cause.
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS}-dimension embedding from ${EMBEDDING_MODEL}, got ${vector.length}`,
    );
  }

  return vector;
}
