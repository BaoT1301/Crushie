/**
 * LLM Proxy Service — tRPC-to-LLM bridge
 *
 * Handles calling the LLM service from tRPC procedures.
 * Manages auth token injection, base64 image conversion, and error handling.
 */

import { getRequestUserId } from "@/server/request-context";

const LLM_BASE_URL = process.env.LLM_URL || "http://localhost:3001";
const LLM_SERVICE_TOKEN = process.env.LLM_SERVICE_TOKEN || "";

const SUPPORTED_LLM_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]);

function normalizeImageMimeType(contentType: string): string {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();

  if (!normalized) return "image/jpeg";
  if (normalized === "image/jpg") return "image/jpeg";
  if (normalized === "image/heif") return "image/heic";

  if (SUPPORTED_LLM_IMAGE_MIME_TYPES.has(normalized)) {
    return normalized;
  }

  return normalized.startsWith("image/") ? "image/jpeg" : "image/jpeg";
}

// ============================================================================
// Types — LLM API response envelope
// ============================================================================

export type LLMResponse<T> = {
  data: T;
  meta: {
    cached?: boolean;
    durationMs?: number;
    usedFallback?: boolean;
    mock?: boolean;
    model?: string;
    message?: string;
  };
};

// ── Vibe Profile types ────────────────────────────────────────────────────

export type LLMVibeProfileData = {
  userId: string;
  vibeName: string;
  vibeSummary: string;
  energy: "chill" | "moderate" | "high" | "chaotic";
  moodTags: string[];
  styleTags: string[];
  interestTags: string[];
  quizAnswers: Record<string, unknown>;
  photoUrls: string[];
  isActive: boolean;
};

// ── Analyzer types ────────────────────────────────────────────────────────

export type LLMAnalyzerData = {
  userId: string;
  imageHash: string;
  hintTags: string[];
  predictedStyle: "direct" | "playful" | "intellectual" | "shy" | "adventurous";
  vibePrediction: Record<string, unknown>;
  conversationOpeners: string[];
  dateSuggestions: Array<{
    title: string;
    description: string;
    vibeMatch: number;
    estimatedCost: string;
    duration: string;
    placeName?: string;
    placeId?: string;
    whyThisSpot?: string;
    lat?: number;
    lng?: number;
    icebreakerQuestion?: string;
    followUpQuestions?: string[];
    topicCues?: string[];
    doTips?: string[];
    avoidTips?: string[];
    bestTimingCue?: string;
  }>;
  modelVersion: string;
  latencyMs: number;
};

// ── Compatibility types ───────────────────────────────────────────────────

export type LLMCompatibilityData = {
  score: number;
  similarityScore: number;
  successProbability: number;
  narrative: string;
  mission: {
    title: string;
    task: string;
    locationId: string;
  };
  commonGround?: string[];
  energyCompatibility?: {
    description: string;
    score: number;
  };
  interestOverlap?: {
    shared: string[];
    complementary: string[];
  };
  conversationStarter?: string;
};

export type MatchPlanPlaceCandidate = {
  name: string;
  placeId: string;
  district: string;
  placeType: string;
  types: string[];
  isIndoor: boolean;
  photoUrl?: string;
};

export type LLMMissionPlanData = LLMCompatibilityData;

export type MatchPlanEnvironmentContext = {
  city: string;
  weather?: {
    condition: "Rain" | "Clear";
    description: string;
    temp: number;
  };
};

// ── Identity verification types ───────────────────────────────────────────

export type LLMImageInput = {
  base64: string;
  mimeType: string;
};

export type VerifyIdentityInput = {
  profilePhoto: LLMImageInput;
  freshSelfie: LLMImageInput;
};

export type VerifyIdentityResult = {
  is_match: boolean;
  confidence: number;
  reasoning: string;
};

export type LiveSuggestionData = {
  suggestion: string;
  visual_cue_detected: string;
  confidence: number;
};

// ── LLM Matches ───────────────────────────────────────────

// ============================================================================
// HTTP Client
// ============================================================================

class LLMServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "LLMServiceError";
  }
}

async function llmFetch<T>(
  path: string,
  body: unknown,
): Promise<LLMResponse<T>> {
  const url = `${LLM_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (LLM_SERVICE_TOKEN) {
    headers["X-Service-Token"] = LLM_SERVICE_TOKEN;
  }

  // Lets the LLM service rate-limit per user instead of per IP.
  //
  // Every request to that service originates from this server, so keying its
  // limiter on the socket address puts all users in one global bucket — one
  // person streaming webcam frames to the realtime coach would 429 everyone
  // else. This header is only trusted because X-Service-Token proves the
  // request came from us; the service ignores it otherwise.
  const endUserId = getRequestUserId();
  if (endUserId) {
    headers["X-End-User-Id"] = endUserId;
  }

  let res: Response;

  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (cause) {
    // A transport failure here throws `TypeError: fetch failed` with the real
    // reason buried in `cause` and no mention of the URL, which is close to
    // useless in a log. It is also the single most likely thing to be wrong
    // after a deploy: LLM_URL unset (so it silently points at localhost), the
    // service not running, or a private hostname whose port does not match the
    // port the service actually listens on.
    //
    // Naming the URL turns a generic network error into the answer.
    const reason =
      cause instanceof Error && cause.cause instanceof Error
        ? cause.cause.message
        : cause instanceof Error
          ? cause.message
          : String(cause);

    throw new LLMServiceError(
      503,
      `Could not reach the AI service at ${url} (${reason}). ` +
        `Check LLM_URL, that the service is running, and that its port matches.`,
    );
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new LLMServiceError(
      res.status,
      (errorBody as { error?: string }).error ||
        `LLM service returned ${res.status}`,
      (errorBody as { details?: unknown }).details,
    );
  }

  return (await res.json()) as LLMResponse<T>;
}

// ============================================================================
// Image helpers
// ============================================================================

/**
 * Hosts this server is willing to fetch images from.
 *
 * Derived from the configured Supabase URL, which is the only place uploads
 * actually live. Anything else is rejected.
 */
function allowedImageHosts(): Set<string> {
  const hosts = new Set<string>();
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabase) {
    try {
      hosts.add(new URL(supabase).host);
    } catch {
      // Malformed config: fall through to an empty allowlist, which rejects
      // everything rather than failing open.
    }
  }
  return hosts;
}

/**
 * Reject anything pointing at the loopback, link-local or private ranges.
 * 169.254.169.254 is the cloud metadata endpoint and the classic SSRF target.
 */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0];
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) {
    return true;
  }
  return (
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === "0.0.0.0" ||
    h === "::1"
  );
}

/**
 * Fetch an image from a URL (e.g. Supabase Storage) and convert to base64.
 *
 * This runs server-side on a URL that originated from user input, so it is a
 * textbook SSRF sink. Previously it fetched anything it was given, with no
 * timeout: an authenticated user could submit http://169.254.169.254/... as a
 * "photo" and have the server fetch it, base64 it, and hand it to a vision
 * model that will happily read it back out.
 */
export async function imageUrlToBase64(
  imageUrl: string,
): Promise<{ base64: string; mimeType: string }> {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new Error("Invalid image URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Unsupported image URL protocol: ${parsed.protocol}`);
  }

  if (isPrivateHost(parsed.host)) {
    throw new Error("Refusing to fetch image from a private address");
  }

  const allowed = allowedImageHosts();
  if (!allowed.has(parsed.host)) {
    throw new Error(`Image host not allowed: ${parsed.host}`);
  }

  // Without a timeout a slow or hanging target holds this request, and the
  // tRPC request above it, open indefinitely.
  const res = await fetch(parsed.toString(), {
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${imageUrl} (${res.status})`);
  }

  const contentType = normalizeImageMimeType(
    res.headers.get("content-type") || "image/jpeg",
  );
  const buffer = Buffer.from(await res.arrayBuffer());
  const base64 = buffer.toString("base64");

  return { base64, mimeType: contentType };
}

/**
 * Convert multiple image URLs to base64 in parallel.
 */
export async function imagesToBase64(
  urls: string[],
): Promise<Array<{ base64: string; mimeType: string }>> {
  return Promise.all(urls.map(imageUrlToBase64));
}

// ============================================================================
// Pipeline 1: Vibe Generation
// ============================================================================

export async function generateVibeProfile(input: {
  userId: string;
  imageUrls: string[];
  hintTags?: string[];
  extraContext?: string;
  photoUrls?: string[];
  useMock?: boolean;
}): Promise<LLMResponse<LLMVibeProfileData>> {
  // Mock mode — no images needed
  if (input.useMock) {
    return llmFetch<LLMVibeProfileData>("/api/vibe-profile/mock", {
      userId: input.userId,
      hintTags: input.hintTags ?? [],
      extraContext: input.extraContext ?? "",
      photoUrls: input.photoUrls ?? input.imageUrls,
    });
  }

  // Production — fetch images from Supabase Storage and convert to base64
  const images = await imagesToBase64(input.imageUrls);

  return llmFetch<LLMVibeProfileData>("/api/vibe-profile", {
    userId: input.userId,
    images,
    hintTags: input.hintTags ?? [],
    extraContext: input.extraContext ?? "",
    photoUrls: input.photoUrls ?? input.imageUrls,
  });
}

// ============================================================================
// Pipeline 2: Profile Analyzer
// ============================================================================

export async function analyzeProfile(input: {
  userId: string;
  imageUrls: string[];
  imageHash: string;
  hintTags?: string[];
  useMock?: boolean;
  environmentContext?: {
    city: string;
    weather?: {
      temp: number;
      feelsLike: number;
      description: string;
      icon: string;
      humidity: number;
      windSpeed: number;
    };
    nearbyPlaces: Array<{
      name: string;
      placeId: string;
      vicinity: string;
      rating?: number;
      types: string[];
      staticMapUrl?: string;
    }>;
  };
}): Promise<LLMResponse<LLMAnalyzerData>> {
  // Mock mode
  if (input.useMock) {
    return llmFetch<LLMAnalyzerData>("/api/analyzer/mock", {
      userId: input.userId,
      imageHash: input.imageHash,
      hintTags: input.hintTags ?? [],
    });
  }

  // Production — fetch all images and convert to base64
  const images = await imagesToBase64(input.imageUrls);

  return llmFetch<LLMAnalyzerData>("/api/analyzer", {
    userId: input.userId,
    images,
    imageHash: input.imageHash,
    hintTags: input.hintTags ?? [],
    environmentContext: input.environmentContext,
  });
}

// ============================================================================
// Pipeline 3: Compatibility Engine
// ============================================================================

export type ProfileSummary = {
  userId: string;
  vibeName: string;
  vibeSummary?: string;
  energy: "chill" | "moderate" | "high" | "chaotic";
  moodTags?: string[];
  styleTags?: string[];
  interestTags?: string[];
};

export async function evaluateMatch(input: {
  profileA: ProfileSummary;
  profileB: ProfileSummary;
  vectorSimilarity?: number;
  useMock?: boolean;
  environmentContext?: MatchPlanEnvironmentContext;
  placeCandidates?: MatchPlanPlaceCandidate[];
}): Promise<LLMResponse<LLMCompatibilityData>> {
  const endpoint = input.useMock
    ? "/api/evaluate-match/mock"
    : "/api/evaluate-match";

  return llmFetch<LLMCompatibilityData>(endpoint, {
    profileA: input.profileA,
    profileB: input.profileB,
    vectorSimilarity: input.vectorSimilarity,
    environmentContext: input.environmentContext,
    placeCandidates: input.placeCandidates,
  });
}

// ============================================================================
// Pipeline 4: Identity Verification
// ============================================================================

export async function verifyIdentity(
  input: VerifyIdentityInput,
): Promise<LLMResponse<VerifyIdentityResult>> {
  return llmFetch<VerifyIdentityResult>("/api/verify-identity", input);
}

// ============================================================================
// Realtime Coach
// ============================================================================

export async function getLiveSuggestion(input: {
  frame: string;
  targetVibe: string;
  currentTopic?: string;
  language?: string;
}): Promise<LLMResponse<LiveSuggestionData>> {
  return llmFetch<LiveSuggestionData>("/api/realtime-coach", {
    frame: input.frame,
    targetVibe: input.targetVibe,
    currentTopic: input.currentTopic ?? "",
    language: input.language ?? "Respond in English.",
  });
}

// ============================================================================
// Vibe Match
// ============================================================================

/**
 * One entry in the vibe-match ranking.
 *
 * The declared return type here used to be `LLMResponse<LLMVibeProfileData[]>`,
 * which described neither the envelope nor the element shape: the service
 * returns `{ topMatches, meta }` at the top level — not wrapped in `data` — and
 * each entry nests the profile under a `profile` key alongside the model's
 * narrative. Callers compensated with chains of optional-chained fallbacks and
 * `as any`. Typing it accurately is what lets the procedure above reason about
 * which candidates came back.
 */
export type VibeMatchEntry = {
  profile: ProfileSummary;
  narrative: string | null;
};

export type VibeMatchResponse = {
  topMatches: VibeMatchEntry[];
  meta?: LLMResponse<unknown>["meta"];
};

export async function vibeMatch(input: {
  profile: ProfileSummary;
  otherUsers: ProfileSummary[];
  limit: number;
  vectorSimilarity?: number;
  useMock?: boolean;
}): Promise<VibeMatchResponse> {
  const endpoints = input.useMock
    ? ["/api/vibe-match/mock", "/api/vibe-match", "/api/vibe-match/top"]
    : ["/api/vibe-match", "/api/vibe-match/top"];

  let lastError: unknown;

  for (const endpoint of endpoints) {
    try {
      // Cast through unknown: llmFetch always wraps in LLMResponse<T>, but this
      // one endpoint returns its payload unwrapped, so the envelope types do
      // not overlap.
      return (await llmFetch<unknown>(endpoint, {
        profile: input.profile,
        otherUsers: input.otherUsers,
        vectorSimilarity: input.vectorSimilarity,
      })) as unknown as VibeMatchResponse;
    } catch (error) {
      if (error instanceof LLMServiceError && error.statusCode === 404) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw (
    lastError ??
    new Error("No compatible vibe-match endpoint found on LLM service")
  );
}

// ============================================================================
// Embeddings
// ============================================================================

/**
 * Vector for a vibe profile, used by every similarity query.
 *
 * Proxied through the LLM service because OPENAI_API_KEY lives there.
 */
export async function generateEmbedding(
  text: string,
): Promise<LLMResponse<{ embedding: number[]; dimensions: number }>> {
  return llmFetch<{ embedding: number[]; dimensions: number }>(
    "/api/embeddings",
    { text },
  );
}

// ============================================================================
// Sample persona replies
// ============================================================================

export type PersonaReplyInput = {
  persona: {
    vibeName: string;
    vibeSummary?: string;
    energy?: "chill" | "moderate" | "high" | "chaotic";
    moodTags?: string[];
    interestTags?: string[];
  };
  history: Array<{ role: "persona" | "user"; content: string }>;
};

/**
 * One in-character chat reply from a seeded sample profile.
 *
 * See apps/llm/src/routes/persona-reply.ts for the constraints the prompt puts
 * on it — chiefly that it must not claim to be a real person or arrange to meet.
 */
export async function generatePersonaReply(
  input: PersonaReplyInput,
): Promise<LLMResponse<{ reply: string }>> {
  return llmFetch<{ reply: string }>("/api/persona-reply", input);
}
