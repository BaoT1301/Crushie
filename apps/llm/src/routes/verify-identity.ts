import { Router } from "express";
import { z } from "zod";
import { generateMultimodalJSON, type ImageInput } from "../lib/ai.js";
import { formatPrompt } from "../lib/prompt-formatter.js";
import {
  VERIFICATION_FALLBACK,
  type VerificationIdentityResult,
} from "../lib/fallbacks.js";
import { requireServiceToken } from "../lib/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

const imageSchema = z.object({
  base64: z.string().min(1, "base64 image data is required"),
  mimeType: z
    .string()
    .regex(
      /^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/,
      "mimeType must be image/jpeg, image/jpg, image/png, image/webp, image/gif, image/heic, or image/heif",
    ),
});

const verifyIdentitySchema = z.object({
  profilePhoto: imageSchema,
  freshSelfie: imageSchema,
});

const verifyResponseSchema = z.object({
  is_match: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});

router.post("/", requireServiceToken(), async (req, res) => {
  try {
    const { profilePhoto, freshSelfie } = verifyIdentitySchema.parse(req.body);

    const startTime = Date.now();

    const prompt = formatPrompt({
      role: "Facial identity verification specialist",
      task: "Determine whether both images are the same person and detect spoofing signals.",
      input: {
        profile_photo: "image[0]",
        fresh_selfie: "image[1]",
      },
      rules: [
        "Return strict JSON only.",
        "Compare facial structure, age cues, and stable attributes.",
        "Actively check spoofing signs: phone screen, printed photo, replay attack, heavy reflections, obvious tampering.",
        "If uncertain, set is_match=false and confidence <= 0.5.",
        "Confidence must be a float between 0 and 1.",
      ],
      output: {
        is_match: true,
        confidence: 0.0,
        reasoning: "Concise explanation of match result and spoofing checks.",
      },
    });

    let result: VerificationIdentityResult;
    let usedFallback = false;

    try {
      const parsed = await generateMultimodalJSON<VerificationIdentityResult>(
        prompt,
        [profilePhoto, freshSelfie] as ImageInput[],
        2,
        process.env.OPENAI_MODEL || "gpt-4o",
      );
      result = verifyResponseSchema.parse(parsed);
    } catch (llmError) {
      logger.error("verify-identity failed, using fallback", llmError);
      result = VERIFICATION_FALLBACK;
      usedFallback = true;
    }

    res.json({
      data: result,
      meta: {
        durationMs: Date.now() - startTime,
        model: "openai",
        usedFallback,
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
