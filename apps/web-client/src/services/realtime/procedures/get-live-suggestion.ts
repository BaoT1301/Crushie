import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authedProcedure } from "@/server/init";
import { getLiveSuggestion as callGetLiveSuggestion } from "@/services/llm/client";
import { logger } from "@/lib/logger";

/**
 * Every field is bounded.
 *
 * `frame` is a base64 webcam still and was unbounded here, so this layer would
 * buffer and forward any payload before the LLM service got a chance to reject
 * it at its own 4MB cap. The limit below matches that cap so oversized frames
 * fail at the edge, cheaply.
 *
 * `language` is interpolated into the coach's instruction block as its own
 * line, which makes it the most direct prompt-injection surface here. An enum
 * would be the stronger fix, but the twelve real values live in the client's
 * theme.ts and carry native-script suffixes ("Respond in Vietnamese (Tiếng
 * Việt).") — pinning a hand-written list would silently reject nine of the
 * twelve languages the picker offers. A tight length bound is the honest
 * middle: it caps the injection surface without breaking the feature.
 */
const MAX_FRAME_BYTES = 4_000_000;

const inputSchema = z.object({
  frame: z.string().min(1, "frame is required").max(MAX_FRAME_BYTES),
  targetVibe: z.string().min(1, "targetVibe is required").max(200),
  currentTopic: z.string().max(500).default(""),
  language: z.string().max(100).default("Respond in English."),
});

export const getLiveSuggestion = authedProcedure
  .input(inputSchema)
  .mutation(async ({ input }) => {
    try {
      const { data } = await callGetLiveSuggestion({
        frame: input.frame,
        targetVibe: input.targetVibe,
        currentTopic: input.currentTopic,
        language: input.language,
      });

      return data;
    } catch (error) {
      logger.error("getLiveSuggestion failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to get live suggestion",
      });
    }
  });
