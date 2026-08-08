/**
 * Analyzer Routes — Pipeline 2: Profile Analyzer (Tactical Advice)
 *
 * POST /api/analyzer                — Analyze a profile screenshot via Gemini multimodal
 * POST /api/analyzer/mock           — Return mock analysis (dev/testing)
 * GET  /api/analyzer/styles         — List all predicted styles (dev/testing)
 *
 * Input: single base64 image (screenshot) + optional hint_tags
 * Output: analyzer_sessions schema-compatible JSON
 */

import { Router } from "express";
import { z } from "zod";
import { generateMultimodalJSON, type ImageInput } from "../lib/ai.js";
import { profileAnalyzerPrompt } from "../lib/vibe-prompts.js";
import { generateMockAnalyzerSession } from "../lib/mock-data.js";
import { ANALYZER_FALLBACK, type AnalyzerResult } from "../lib/fallbacks.js";
import { requireServiceToken } from "../lib/auth.js";
import { getCachedResponse, setCachedResponse } from "../lib/redis.js";

const router = Router();
const TARGET_OPENER_COUNT = 8;

type FallbackSource = "parse_error" | "model_api_error" | "unknown";

const DEFAULT_OPENERS = [
  "What's one detail in your profile that people miss but says a lot about you?",
  "What kind of first conversation actually makes you excited to reply?",
  "If we planned a low-pressure first meetup, what vibe would you choose?",
  "What's your favorite way to turn small talk into real talk?",
  "What's an underrated interest of yours you'd love to talk about more?",
  "What's your ideal balance between playful banter and deeper questions?",
  "What's a place in your city that feels very 'you'?",
  "What's one spontaneous plan you'd say yes to this week?",
];

function classifyFallbackSource(error: unknown): FallbackSource {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const name = error instanceof Error ? error.name.toLowerCase() : "";

  if (
    name.includes("syntax") ||
    message.includes("invalid json response") ||
    message.includes("json parse") ||
    message.includes("unterminated string")
  ) {
    return "parse_error";
  }

  if (
    name.includes("google") ||
    message.includes("openai") ||
    message.includes("api") ||
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("timeout")
  ) {
    return "model_api_error";
  }

  return "unknown";
}

function logAnalyzerFallback(params: {
  error: unknown;
  userId: string;
  imageCount: number;
  hintTagCount: number;
  hasEnvironment: boolean;
  city?: string;
}) {
  const { error, userId, imageCount, hintTagCount, hasEnvironment, city } =
    params;

  const source = classifyFallbackSource(error);
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const errorMessage =
    error instanceof Error
      ? error.message
      : "Unknown analyzer generation error";

  console.error(
    "[analyzer:fallback]",
    JSON.stringify({
      source,
      errorName,
      errorMessage,
      userId,
      imageCount,
      hintTagCount,
      hasEnvironment,
      city: city ?? null,
    }),
  );
}

function normalizeNonEmptyStrings(values: unknown[]): string[] {
  const unique = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }

  return [...unique];
}

function normalizeConversationOpeners(openers: unknown): string[] {
  const normalized = Array.isArray(openers)
    ? normalizeNonEmptyStrings(openers)
    : [];

  for (const fallback of DEFAULT_OPENERS) {
    if (normalized.length >= TARGET_OPENER_COUNT) break;
    if (!normalized.includes(fallback)) {
      normalized.push(fallback);
    }
  }

  return normalized.slice(0, TARGET_OPENER_COUNT);
}

function normalizeRange(
  values: unknown,
  min: number,
  max: number,
  fallback: string[],
): string[] {
  const normalized = Array.isArray(values)
    ? normalizeNonEmptyStrings(values)
    : [];

  for (const item of fallback) {
    if (normalized.length >= max) break;
    if (!normalized.includes(item)) {
      normalized.push(item);
    }
  }

  return normalized.slice(0, Math.max(min, Math.min(max, normalized.length)));
}

function normalizeSuggestedMission(mission: Record<string, unknown>) {
  const getText = (value: unknown, fallback: string): string =>
    typeof value === "string" && value.trim().length > 0 ? value : fallback;

  const getNullableText = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value : null;

  const getNullableNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  const title =
    typeof mission.title === "string" && mission.title.trim().length > 0
      ? mission.title
      : "Date mission";

  const icebreakerQuestion =
    typeof mission.icebreakerQuestion === "string" &&
    mission.icebreakerQuestion.trim().length > 0
      ? mission.icebreakerQuestion
      : `What part of "${title}" sounds most like your kind of date?`;

  return {
    title,
    description: getText(
      mission.description,
      "A low-pressure plan designed to keep the conversation naturally flowing.",
    ),
    vibeMatch:
      typeof mission.vibeMatch === "number" &&
      Number.isFinite(mission.vibeMatch)
        ? Math.max(0, Math.min(1, mission.vibeMatch))
        : 0.7,
    estimatedCost: getText(mission.estimatedCost, "$10-$20"),
    duration: getText(mission.duration, "1-2 hours"),
    placeName: getNullableText(mission.placeName),
    placeId: getNullableText(mission.placeId),
    whyThisSpot: getNullableText(mission.whyThisSpot),
    lat: getNullableNumber(mission.lat),
    lng: getNullableNumber(mission.lng),
    icebreakerQuestion,
    followUpQuestions: normalizeRange(mission.followUpQuestions, 2, 3, [
      "What would make this plan feel easy and natural for you?",
      "Would you rather keep this spontaneous or lightly planned?",
      "What's one detail that would make this date memorable for you?",
    ]),
    topicCues: normalizeRange(mission.topicCues, 2, 4, [
      "Shared interests",
      "Favorite local spots",
      "Ideal date pace",
      "Fun personal stories",
    ]),
    doTips: normalizeRange(mission.doTips, 2, 3, [
      "Keep your invite specific and low-pressure",
      "Ask one open-ended follow-up after their reply",
      "Offer a simple backup option",
    ]),
    avoidTips: normalizeRange(mission.avoidTips, 1, 2, [
      "Avoid overloading with logistics too early",
      "Avoid generic one-liners after a strong opener",
    ]),
    bestTimingCue:
      typeof mission.bestTimingCue === "string" &&
      mission.bestTimingCue.trim().length > 0
        ? mission.bestTimingCue
        : "Suggest this after a positive back-and-forth, before the chat loses momentum.",
  };
}

function normalizeAnalyzerResult(result: AnalyzerResult): AnalyzerResult {
  const normalizedMissions = Array.isArray(result.suggestedMissions)
    ? result.suggestedMissions.map((mission) =>
        normalizeSuggestedMission(mission as Record<string, unknown>),
      )
    : [];

  return {
    ...result,
    conversationOpeners: normalizeConversationOpeners(
      result.conversationOpeners,
    ),
    suggestedMissions: normalizedMissions,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Validation Schemas
// ──────────────────────────────────────────────────────────────────────────

const imageSchema = z.object({
  base64: z.string().min(1, "base64 image data is required"),
  mimeType: z
    .string()
    .regex(
      /^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/,
      "mimeType must be image/jpeg, image/jpg, image/png, image/webp, image/gif, image/heic, or image/heif",
    ),
});

const analyzeSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  /** Accept 1-10 images for multi-image analysis */
  images: z
    .array(imageSchema)
    .min(1, "At least 1 image is required")
    .max(10, "Maximum 10 images")
    .optional(),
  /** @deprecated — use `images` array instead. Kept for backward compatibility */
  image: imageSchema.optional(),
  imageHash: z.string().min(1, "imageHash is required"),
  hintTags: z
    .array(z.string())
    .max(20, "Maximum 20 hint tags")
    .optional()
    .default([]),
  /** Optional environmental context for location-aware suggestions */
  environmentContext: z
    .object({
      city: z.string(),
      weather: z
        .object({
          temp: z.number(),
          feelsLike: z.number(),
          description: z.string(),
          icon: z.string(),
          humidity: z.number(),
          windSpeed: z.number(),
        })
        .optional(),
      nearbyPlaces: z
        .array(
          z.object({
            name: z.string(),
            placeId: z.string(),
            vicinity: z.string(),
            rating: z.number().optional(),
            types: z.array(z.string()),
            staticMapUrl: z.string().optional(),
            lat: z.number().optional(),
            lng: z.number().optional(),
          }),
        )
        .default([]),
    })
    .optional(),
});

const mockAnalyzeSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  imageHash: z.string().min(1, "imageHash is required"),
  hintTags: z
    .array(z.string())
    .max(20, "Maximum 20 hint tags")
    .optional()
    .default([]),
});

// ──────────────────────────────────────────────────────────────────────────
// POST / — Analyze a profile screenshot via Gemini (production)
// ──────────────────────────────────────────────────────────────────────────

router.post("/", requireServiceToken(), async (req, res) => {
  try {
    const parsed = analyzeSchema.parse(req.body);
    const { userId, imageHash, hintTags, environmentContext } = parsed;

    // Normalize: support both `images[]` (new) and `image` (legacy)
    const images: ImageInput[] = parsed.images
      ? (parsed.images as ImageInput[])
      : parsed.image
        ? [parsed.image as ImageInput]
        : [];

    if (images.length === 0) {
      res.status(400).json({
        error:
          "At least 1 image is required (provide `images` array or legacy `image` field)",
      });
      return;
    }

    const startTime = Date.now();

    // Build prompt with hint tags + environmental context
    const promptContext: Record<string, unknown> = { userId };
    if (environmentContext) {
      promptContext.environmentContext = environmentContext;
    }
    const prompt = profileAnalyzerPrompt(
      { hintTags, imageHash },
      promptContext,
    );

    // Check cache (include image count + city for differentiation)
    const envKey = environmentContext?.city ?? "no-location";
    const cacheKey = `analyze:${imageHash}:${images.length}:${hintTags.join(",")}:${envKey}`;
    const cached = await getCachedResponse(cacheKey);
    if (cached) {
      const analyzerResult = normalizeAnalyzerResult(
        JSON.parse(cached) as AnalyzerResult,
      );
      res.json({
        data: {
          userId,
          imageHash,
          hintTags,
          predictedStyle: analyzerResult.predictedStyle,
          vibePrediction: analyzerResult.vibePrediction,
          conversationOpeners: analyzerResult.conversationOpeners,
          dateSuggestions: analyzerResult.suggestedMissions,
          modelVersion: "openai",
          latencyMs: Date.now() - startTime,
        },
        meta: { cached: true, durationMs: Date.now() - startTime },
      });
      return;
    }

    // Call Gemini with the screenshot(s) + prompt
    let analyzerResult: AnalyzerResult;
    let usedFallback = false;
    const llmProvider = "openai";

    try {
      // Sends the screenshots WITH the prompt. This previously called
      // callLLM(prompt), which is text-only: the images array was built,
      // validated non-empty, then used only for .length in logging and the
      // cache key. The bytes never reached the model, so the "screenshot
      // analyzer" was inventing results from hintTags and an image hash while
      // presenting them as if it had looked at the photos.
      const analyzed = await generateMultimodalJSON<AnalyzerResult>(
        prompt,
        images,
      );
  
      analyzerResult = normalizeAnalyzerResult(analyzed);

      console.log(
        `✅ Analyzer used: ${llmProvider} (${images.length} image(s))`,
      );
    } catch (llmError) {
      logAnalyzerFallback({
        error: llmError,
        userId,
        imageCount: images.length,
        hintTagCount: hintTags.length,
        hasEnvironment: !!environmentContext,
        city: environmentContext?.city,
      });
      analyzerResult = normalizeAnalyzerResult(ANALYZER_FALLBACK);
      usedFallback = true;
    }

    const durationMs = Date.now() - startTime;

    // Cache successful non-fallback results
    if (!usedFallback) {
      await setCachedResponse(cacheKey, JSON.stringify(analyzerResult), 3600);
    }

    res.json({
      data: {
        userId,
        imageHash,
        hintTags,
        predictedStyle: analyzerResult.predictedStyle,
        vibePrediction: analyzerResult.vibePrediction,
        conversationOpeners: analyzerResult.conversationOpeners,
        dateSuggestions: analyzerResult.suggestedMissions,
        modelVersion: usedFallback ? "fallback-v1.0.0" : ("openai"),
        latencyMs: durationMs,
      },
      meta: {
        cached: false,
        durationMs,
        usedFallback,
        model: llmProvider,
        imageCount: images.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request", details: error.errors });
      return;
    }
    throw error;
  }
});

// ──────────────────────────────────────────────────────────────────────────
// POST /mock — Mock analysis (dev/testing, no Gemini needed)
// ──────────────────────────────────────────────────────────────────────────

router.post("/mock", async (req, res) => {
  try {
    const { userId, imageHash, hintTags } = mockAnalyzeSchema.parse(req.body);

    const startTime = Date.now();
    const session = generateMockAnalyzerSession({
      userId,
      imageHash,
      hintTags,
    });
    const durationMs = Date.now() - startTime;

    res.json({
      data: session,
      meta: {
        mock: true,
        durationMs,
        message:
          "This is mock data. Use POST /api/analyzer for real AI analysis.",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request", details: error.errors });
      return;
    }
    throw error;
  }
});

// ──────────────────────────────────────────────────────────────────────────
// GET /styles — List styles & hint tag examples (dev/testing)
// ──────────────────────────────────────────────────────────────────────────

router.get("/styles", (_req, res) => {
  res.json({
    styles: ["direct", "playful", "intellectual", "shy", "adventurous"],
    hintTagExamples: [
      "University student",
      "Loves hiking",
      "Foodie",
      "Dog person",
      "Gym enthusiast",
      "Music lover",
      "Bookworm",
      "Traveler",
    ],
  });
});

export default router;
