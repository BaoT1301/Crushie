/**
 * Vibe Profile Routes — Pipeline 1: Vibe Generation
 *
 * POST /api/vibe-profile            — Generate a Vibe Card via Gemini multimodal
 * POST /api/vibe-profile/mock       — Generate a mock Vibe Card (dev/testing)
 * GET  /api/vibe-profile/presets    — List presets & sample quiz (dev/testing)
 *
 * Input: 3-5 base64 images + quiz_responses JSON
 * Output: vibe_profiles schema-compatible JSON
 */

import { Router } from "express";
import { z } from "zod";
import { generateMultimodalJSON, type ImageInput } from "../lib/ai.js";
import { vibeGenerationPrompt } from "../lib/vibe-prompts.js";
import { generateMockVibeProfile } from "../lib/mock-data.js";
import {
  VIBE_GENERATION_FALLBACK,
  type VibeGenerationResult,
} from "../lib/fallbacks.js";
import { requireServiceToken } from "../lib/auth.js";
import { getCachedResponse, setCachedResponse } from "../lib/redis.js";

const router = Router();

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

const generateVibeSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  images: z
    .array(imageSchema)
    .min(1, "At least 1 image is required")
    .max(10, "Maximum 10 images allowed"),
  hintTags: z.array(z.string().max(50)).max(10).optional().default([]),
  extraContext: z.string().max(500).optional().default(""),
  photoUrls: z.array(z.string()).optional().default([]),
});

const mockGenerateSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  hintTags: z.array(z.string().max(50)).max(10).optional().default([]),
  extraContext: z.string().max(500).optional().default(""),
  photoUrls: z.array(z.string()).optional().default([]),
});

// ──────────────────────────────────────────────────────────────────────────
// POST / — Generate a Vibe Card via Gemini (production)
// ──────────────────────────────────────────────────────────────────────────

router.post("/", requireServiceToken(), async (req, res) => {
  try {
    const { userId, images, hintTags, extraContext, photoUrls } =
      generateVibeSchema.parse(req.body);

    const startTime = Date.now();

    // Build the prompt with hint tags + extra context
    const prompt = vibeGenerationPrompt(
      { hintTags, extraContext },
      { imageCount: images.length, userId },
    );

    // Check cache
    const tagKey = hintTags.length > 0 ? hintTags.sort().join(",") : "none";
    const contextKey = extraContext ? extraContext.slice(0, 50) : "none";
    const cacheKey = `vibe:${userId}:${tagKey}:${contextKey}`;
    const cached = await getCachedResponse(cacheKey);
    if (cached) {
      const vibeResult = JSON.parse(cached) as VibeGenerationResult;
      res.json({
        data: {
          userId,
          ...vibeResult,
          quizAnswers: { hintTags, extraContext },
          photoUrls,
          isActive: true,
        },
        meta: { cached: true, durationMs: Date.now() - startTime },
      });
      return;
    }

    // Call Gemini with images + prompt (retry built into generateMultimodalJSON)
    let vibeResult: VibeGenerationResult;
    let usedFallback = false;

    try {
      vibeResult = await generateMultimodalJSON<VibeGenerationResult>(
        prompt,
        images as ImageInput[],
        2,
      );
    } catch (llmError) {
      console.error(
        "❌ AI vibe generation failed, using fallback:",
        llmError,
      );
      vibeResult = VIBE_GENERATION_FALLBACK;
      usedFallback = true;
    }

    const durationMs = Date.now() - startTime;

    // Cache successful non-fallback results
    if (!usedFallback) {
      await setCachedResponse(cacheKey, JSON.stringify(vibeResult), 3600);
    }

    res.json({
      data: {
        userId,
        ...vibeResult,
        quizAnswers: { hintTags, extraContext },
        photoUrls,
        isActive: true,
      },
      meta: {
        cached: false,
        durationMs,
        usedFallback,
        model: "openai",
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
// POST /mock — Generate a mock Vibe Card (dev/testing, no Gemini needed)
// ──────────────────────────────────────────────────────────────────────────

router.post("/mock", async (req, res) => {
  try {
    const { userId, hintTags, extraContext, photoUrls } =
      mockGenerateSchema.parse(req.body);

    const startTime = Date.now();
    const vibeProfile = generateMockVibeProfile({
      userId,
      quizAnswers: { hintTags, extraContext },
      photoUrls,
    });
    const durationMs = Date.now() - startTime;

    res.json({
      data: vibeProfile,
      meta: {
        mock: true,
        durationMs,
        message:
          "This is mock data. Use POST /api/vibe-profile for real AI analysis.",
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
// GET /presets — List presets & sample quiz payload (dev/testing)
// ──────────────────────────────────────────────────────────────────────────

router.get("/presets", (_req, res) => {
  res.json({
    presets: [
      "The Urban Minimalist",
      "The High-Energy Foodie",
      "The Chaotic Creative",
      "The Cozy Homebody",
      "The Sunset Chaser",
      "The Night Owl Intellectual",
    ],
    quizSample: {
      rainyFriday: "vinyl_chill",
      travelStyle: "spontaneous",
      socialBattery: "ambivert",
      dateVibe: "coffee_deep_talk",
      musicMood: "indie",
    },
  });
});

export default router;
