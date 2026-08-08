/**
 * Vibe Matching Service — Pipeline 4: Suggest Top Matches
 *
 * POST /api/vibe-match/top — Given a user profile, calculate compatibility
 *                           scores against all users and return top 5 matches.
 *
 * Input: userId, optional: limit (default 5)
 * Output: array of top match profiles with compatibility results
 */

import { Router } from "express";
import { z } from "zod";
import { generateJSONWithRetry } from "../lib/ai.js";
import { compatibilityPrompt } from "../lib/vibe-prompts.js";
import { COMPATIBILITY_FALLBACK, type CompatibilityResult } from "../lib/fallbacks.js";
import { requireServiceToken } from "../lib/auth.js";
import { getCachedResponse, setCachedResponse } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

const router = Router();

// Caps the fan-out. Without this, one request with a large otherUsers
// array triggers that many parallel Gemini calls, each retried up to 3x.
const MAX_OTHER_USERS = 25;

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

// const topMatchSchema = z.object({
//   userId: z.string().min(1),
//   limit: z.number().min(1).max(20).optional().default(5),
// });

// ──────────────────────────────────────────────────────────────────────────
// Helper: Evaluate compatibility between two profiles
// ──────────────────────────────────────────────────────────────────────────

async function evaluateCompatibility(
  profileA: z.infer<typeof profileSummarySchema>,
  profileB: z.infer<typeof profileSummarySchema>
): Promise<CompatibilityResult> {
  try {
    const prompt = compatibilityPrompt({
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
    });

    // Check cache first
    const cacheKey = `compat:${profileA.userId}:${profileB.userId}`;
    const cached = await getCachedResponse(cacheKey);
    if (cached) {
      return JSON.parse(cached) as CompatibilityResult;
    }

    let result: CompatibilityResult;
    try {
      result = await generateJSONWithRetry<CompatibilityResult>(prompt, 2);
    } catch {
      result = COMPATIBILITY_FALLBACK;
    }

    // Cache result
    await setCachedResponse(cacheKey, JSON.stringify(result), 3600);

    return result;
  } catch (err) {
    logger.error("Error evaluating compatibility", err);
    return COMPATIBILITY_FALLBACK;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// POST /top — Suggest Top Matches
// ──────────────────────────────────────────────────────────────────────────

router.post("/", requireServiceToken(), async (req, res) => {
  try {
    const LIMIT = 5;
    // Fetch current user's profile
    const currentUser = req.body.profile;

    // Fetch all other users
  // Capped: without this, one request with a large otherUsers array fans out
  // to that many parallel model calls, each retried up to 3x.
  const allProfiles = (req.body.otherUsers ?? []).slice(0, MAX_OTHER_USERS);

    // Compute compatibility scores for each
    const results = await Promise.all(
      allProfiles.map(async(profile: any) => {
        const scoreResult = await evaluateCompatibility(currentUser, profile);
        return { profile, score: scoreResult.score, narrative: scoreResult.narrative };
      })
    );

    // Sort descending by score
    results.sort((a: any, b: any) => b.score - a.score);
    const finalRes = results.slice(0, LIMIT);
    // Return top N matches
    res.json({
      topMatches: results.slice(0, LIMIT),
      meta: { totalProfiles: allProfiles.length },
    });
  } catch (err) {
    console.error(err);
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request", details: err.errors });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

export default router;
