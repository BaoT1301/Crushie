/**
 * Evaluate Match Routes — Pipeline 3: Compatibility Engine
 *
 * POST /api/evaluate-match          — Compare two profiles & generate synergy narrative
 * POST /api/evaluate-match/mock     — Return mock compatibility result (dev/testing)
 *
 * Input: profile_a + profile_b (textual summaries)
 * Output: compatibility score, narrative, common ground
 *
 * Note: The tRPC service handles pgvector similarity search and sends
 *       the top 5 most similar profiles. This service only generates
 *       the narrative/score, not the vector search.
 */

import { Router } from "express";
import { z } from "zod";
import { generateJSONWithRetry } from "../lib/ai.js";
import { compatibilityPrompt } from "../lib/vibe-prompts.js";
import {
  COMPATIBILITY_FALLBACK,
  type CompatibilityResult,
} from "../lib/fallbacks.js";
import { requireServiceToken } from "../lib/auth.js";
import { getCachedResponse, setCachedResponse } from "../lib/redis.js";

const router = Router();

// ──────────────────────────────────────────────────────────────────────────
// Validation Schemas
// ──────────────────────────────────────────────────────────────────────────

const profileSummarySchema = z.object({
  userId: z.string().min(1),
  vibeName: z.string().min(1),
  vibeSummary: z.string().optional(),
  energy: z.enum(["chill", "moderate", "high", "chaotic"]),
  moodTags: z.array(z.string()).optional().default([]),
  styleTags: z.array(z.string()).optional().default([]),
  interestTags: z.array(z.string()).optional().default([]),
});

const evaluateMatchSchema = z.object({
  profileA: profileSummarySchema,
  profileB: profileSummarySchema,
  /** Pre-computed cosine similarity from pgvector (optional) */
  vectorSimilarity: z.number().min(0).max(1).optional(),
  environmentContext: z
    .object({
      city: z.string().min(1),
      weather: z
        .object({
          condition: z.enum(["Rain", "Clear"]),
          description: z.string().min(1),
          temp: z.number(),
        })
        .optional(),
    })
    .optional(),
  placeCandidates: z
    .array(
      z.object({
        name: z.string().min(1),
        placeId: z.string().min(1),
        district: z.string().min(1),
        placeType: z.string().min(1),
        types: z.array(z.string()).default([]),
        isIndoor: z.boolean(),
      }),
    )
    .min(1)
    .max(5)
    .optional(),
});

const missionPlanSchema = z
  .object({
    mission: z
      .object({
        title: z.string().min(1),
        task: z.string().min(1),
        // Not .min(1): the prompt asks the model to pick a location_id from
        // placeCandidates, and there are none when GOOGLE_MAPS_API_KEY is
        // unset. Requiring a non-empty string made the model's correct answer
        // ("no candidates, so no id") fail validation, so EVERY compatibility
        // evaluation silently fell back to canned text on any setup without
        // Maps configured. Downstream already handles an empty id.
        location_id: z.string(),
      })
      .strict(),
    similarityScore: z.number().min(0).max(1),
    successProbability: z.number().int().min(0).max(100),
    narrative: z.string().min(1),
  })
  .strict();

// ──────────────────────────────────────────────────────────────────────────
// POST / — Evaluate compatibility via Gemini (production)
// ──────────────────────────────────────────────────────────────────────────

router.post("/", requireServiceToken(), async (req, res) => {
  try {
    const {
      profileA,
      profileB,
      vectorSimilarity,
      environmentContext,
      placeCandidates,
    } = evaluateMatchSchema.parse(req.body);

    const startTime = Date.now();

    // Build the prompt
    const prompt = compatibilityPrompt(
      {
        profileA: {
          vibeName: profileA.vibeName,
          energy: profileA.energy,
          interests: profileA.interestTags,
          summary: profileA.vibeSummary || profileA.vibeName,
          moodTags: profileA.moodTags,
          styleTags: profileA.styleTags,
        },
        profileB: {
          vibeName: profileB.vibeName,
          energy: profileB.energy,
          interests: profileB.interestTags,
          summary: profileB.vibeSummary || profileB.vibeName,
          moodTags: profileB.moodTags,
          styleTags: profileB.styleTags,
        },
        placeCandidates: placeCandidates ?? [],
      },
      {
        ...(vectorSimilarity != null
          ? { preComputedVectorSimilarity: vectorSimilarity }
          : {}),
        ...(environmentContext
          ? {
              weather: environmentContext.weather,
              city: environmentContext.city,
            }
          : {}),
      },
    );

    // Check cache
    const cacheKey = `match:${profileA.userId}:${profileB.userId}`;
    const cached = await getCachedResponse(cacheKey);
    if (cached) {
      const result = JSON.parse(cached) as CompatibilityResult;
      res.json({
        data: result,
        meta: {
          cached: true,
          durationMs: Date.now() - startTime,
          profileAId: profileA.userId,
          profileBId: profileB.userId,
        },
      });
      return;
    }

    // Call Gemini with retry logic
    let result: CompatibilityResult;
    let usedFallback = false;

    try {
      const generated = await generateJSONWithRetry<CompatibilityResult>(
        prompt,
        2,
      );
      const parsed = missionPlanSchema.parse(generated);
      const selectedLocationId = parsed.mission.location_id;
      result = {
        similarityScore: parsed.similarityScore,
        successProbability: parsed.successProbability,
        narrative: parsed.narrative,
        mission: {
          title: parsed.mission.title,
          task: parsed.mission.task,
          locationId: selectedLocationId,
        },
        score: parsed.similarityScore,
      };

      if (placeCandidates?.length) {
        const validPlace = placeCandidates.some(
          (item) => item.placeId === selectedLocationId,
        );
        if (!validPlace) {
          throw new Error(
            "LLM selected mission location outside provided candidate set",
          );
        }
      }

      if (
        environmentContext?.weather?.condition === "Rain" &&
        placeCandidates?.length
      ) {
        const selected = placeCandidates.find(
          (item) => item.placeId === selectedLocationId,
        );
        if (selected && !selected.isIndoor) {
          throw new Error("Rain condition requires indoor location");
        }
      }
    } catch (llmError) {
      console.error(
        "❌ AI compatibility evaluation failed, using fallback:",
        llmError,
      );
      const fallbackLocation =
        placeCandidates?.[0]?.placeId ??
        COMPATIBILITY_FALLBACK.mission.locationId;
      result = {
        ...COMPATIBILITY_FALLBACK,
        score: COMPATIBILITY_FALLBACK.similarityScore,
        mission: {
          ...COMPATIBILITY_FALLBACK.mission,
          locationId: fallbackLocation,
        },
      };
      usedFallback = true;
    }

    const durationMs = Date.now() - startTime;

    // Cache successful non-fallback results
    if (!usedFallback) {
      await setCachedResponse(cacheKey, JSON.stringify(result), 3600);
    }

    res.json({
      data: result,
      meta: {
        cached: false,
        durationMs,
        usedFallback,
        model: "openai",
        profileAId: profileA.userId,
        profileBId: profileB.userId,
        vectorSimilarity: vectorSimilarity ?? null,
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
// POST /mock — Mock compatibility evaluation (dev/testing)
// ──────────────────────────────────────────────────────────────────────────

router.post("/mock", async (req, res) => {
  try {
    const { profileA, profileB, placeCandidates } = evaluateMatchSchema.parse(
      req.body,
    );

    const startTime = Date.now();

    // Generate a pseudo-random score based on shared interests
    const sharedInterests = profileA.interestTags.filter((tag) =>
      profileB.interestTags.includes(tag),
    );
    const baseScore = Math.min(
      0.4 + sharedInterests.length * 0.12 + Math.random() * 0.1,
      1.0,
    );
    const similarityScore = Math.round(baseScore * 100) / 100;
    const successProbability = Math.round(
      Math.min(96, 45 + similarityScore * 50),
    );

    const selectedPlaceId =
      placeCandidates?.[Math.floor(Math.random() * placeCandidates.length)]
        ?.placeId ?? "mock_place";

    const result: CompatibilityResult = {
      score: similarityScore,
      similarityScore,
      successProbability,
      narrative:
        similarityScore > 0.7
          ? `${profileA.vibeName} meets ${profileB.vibeName} — there's a genuine spark here. You share ${sharedInterests.length > 0 ? sharedInterests.join(", ") : "a certain energy"} that could lead somewhere interesting.`
          : `${profileA.vibeName} and ${profileB.vibeName} are different flavors — but sometimes that's where the best stories start. One of you will have to make the first move.`,
      mission: {
        title: "Cupid's Micro-Quest",
        task: "Find one menu item for each other and explain why it fits their vibe.",
        locationId: selectedPlaceId,
      },
    };

    const durationMs = Date.now() - startTime;

    res.json({
      data: result,
      meta: {
        mock: true,
        durationMs,
        message:
          "This is mock data. Use POST /api/evaluate-match for real AI analysis.",
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

export default router;
