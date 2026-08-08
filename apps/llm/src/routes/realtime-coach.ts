import { Router } from "express";
import { z } from "zod";
import { generateMultimodalJSON, type ImageInput } from "../lib/ai.js";
import { requireServiceToken } from "../lib/auth.js";
import { streamWingmanSpeech } from "../lib/elevenlabs.js";
import { logger } from "../lib/logger.js";

const router = Router();

const realtimeSuggestionSchema = z.object({
  frame: z.string().min(32, "frame is required").max(4_000_000),
  targetVibe: z.string().min(1, "targetVibe is required").max(120),
  currentTopic: z.string().max(200).optional().default(""),
  language: z.string().max(100).optional().default("Respond in English."),
});

const ttsSchema = z.object({
  text: z.string().min(1, "text is required").max(300),
});

type RealtimeCoachResult = {
  suggestion: string;
  visual_cue_detected: string;
  confidence: number;
};

const realtimeModelCandidates = [process.env.OPENAI_FAST_MODEL || "gpt-4o-mini"].filter(
  (value): value is string => typeof value === "string" && value.length > 0,
);

async function generateRealtimeCoachSuggestion(
  prompt: string,
  image: ImageInput,
): Promise<{
  result: RealtimeCoachResult;
  model: string;
  usedFallback: boolean;
}> {
  let lastError: unknown;

  for (const model of realtimeModelCandidates) {
    try {
      const result = await generateMultimodalJSON<RealtimeCoachResult>(
        prompt,
        [image],
        1,
        model,
      );
      return {
        result,
        model,
        usedFallback: model !== realtimeModelCandidates[0],
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      const modelMissing =
        message.includes("model") &&
        (message.includes("not found") || message.includes("not supported"));

      if (!modelMissing) {
        throw error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("No valid realtime model available");
}

router.post("/", requireServiceToken(), async (req, res) => {
  try {
    const parsed = realtimeSuggestionSchema.parse(req.body);

    const image: ImageInput = {
      base64: parsed.frame,
      mimeType: "image/jpeg",
    };

    const prompt = [
      "You are a live dating coach with a warm, supportive wingman tone.",
      "Analyze the camera frame and infer immediate social cues from person/environment.",
      `Target vibe profile: ${parsed.targetVibe}.`,
      parsed.currentTopic
        ? `Current topic in conversation: ${parsed.currentTopic}.`
        : "Current topic in conversation: not provided.",
      parsed.language,
      "Output STRICT JSON only with keys: suggestion, visual_cue_detected, confidence.",
      "suggestion: one sentence user can say right now, natural and specific. Must be in the specified language.",
      "visual_cue_detected: short cue such as smiling, coffee on table, eye contact, posture.",
      "confidence: number from 0 to 1.",
    ].join("\n");

    const generatedPayload = await generateRealtimeCoachSuggestion(
      prompt,
      image,
    );
    const generated = generatedPayload.result;

    const normalizedSuggestion =
      typeof generated.suggestion === "string" && generated.suggestion.trim()
        ? generated.suggestion.trim()
        : "Ask a warm follow-up question about what they just mentioned.";

    const normalizedCue =
      typeof generated.visual_cue_detected === "string" &&
      generated.visual_cue_detected.trim()
        ? generated.visual_cue_detected.trim()
        : "Limited visual cues detected";

    const normalizedConfidence =
      typeof generated.confidence === "number" &&
      Number.isFinite(generated.confidence)
        ? Math.max(0, Math.min(1, generated.confidence))
        : 0.6;

    res.json({
      data: {
        suggestion: normalizedSuggestion,
        visual_cue_detected: normalizedCue,
        confidence: normalizedConfidence,
      },
      meta: {
        model: generatedPayload.model,
        usedFallback: generatedPayload.usedFallback,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: "Validation error",
        details: error.issues,
      });
      return;
    }

    logger.error("realtime-coach failed", error);
    res.json({
      data: {
        suggestion:
          "Try this: 'I like your energy—what's been the highlight of your day so far?'",
        visual_cue_detected: "LLM temporarily unavailable; using safe fallback",
        confidence: 0.45,
      },
      meta: {
        usedFallback: true,
        model: "fallback",
      },
    });
  }
});

router.post("/tts", requireServiceToken(), async (req, res) => {
  try {
    const parsed = ttsSchema.parse(req.body);

    if (!process.env.ELEVENLABS_API_KEY) {
      res.status(204).end();
      return;
    }

    const audioStream = await streamWingmanSpeech(parsed.text);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    const reader = audioStream.getReader();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        res.write(Buffer.from(value));
      }
    }

    res.end();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: "Validation error",
        details: error.issues,
      });
      return;
    }

    logger.error("realtime-coach tts failed", error);
    res.status(500).json({
      error: "Failed to synthesize speech",
      // Gated, unlike before. ElevenLabs SDK errors carry account and quota
      // detail, and this handler returned them to the caller unconditionally —
      // the only route that skipped the NODE_ENV check the global handler in
      // app.ts applies.
      message:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : "Unknown error"
          : undefined,
    });
  }
});

export default router;
