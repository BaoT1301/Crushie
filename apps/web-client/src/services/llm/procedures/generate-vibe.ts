/**
 * Pipeline 1: Vibe Generation — Generate a Vibe Card via Gemini multimodal
 */

import { authedProcedure } from "@/server/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { vibeProfiles } from "@/services/vibe-profiles/schema";
import { embedAndStoreProfile } from "@/services/vibe-profiles/embedding";
import { generateVibeProfile } from "../client";
import { logger } from "@/lib/logger";

// ── Input ───────────────────────────────────────────────────────────────

export const generateVibeInput = z.object({
  imageUrls: z
    .array(z.url())
    .min(1, "At least 1 image required")
    .max(10, "Maximum 10 images"),
  hintTags: z
    .array(z.string().max(50))
    .max(10, "Maximum 10 hint tags")
    .optional(),
  extraContext: z.string().max(500).optional(),
  photoUrls: z.array(z.string()).optional(),
  useMock: z.boolean().optional().default(false),
});

// ── Procedure ───────────────────────────────────────────────────────────

export const generateVibe = authedProcedure
  .input(generateVibeInput)
  .mutation(async ({ ctx, input }) => {
    try {
      const { data, meta } = await generateVibeProfile({
        userId: ctx.user.id,
        imageUrls: input.imageUrls,
        hintTags: input.hintTags,
        extraContext: input.extraContext,
        photoUrls: input.photoUrls,
        useMock: input.useMock,
      });

      const [saved] = await ctx.secureDb!.rls(async (tx) => {
        const rows = await tx
          .insert(vibeProfiles)
          .values({
            userId: ctx.user.id,
            vibeName: data.vibeName,
            vibeSummary: data.vibeSummary,
            energy: data.energy,
            moodTags: data.moodTags,
            styleTags: data.styleTags,
            interestTags: data.interestTags,
            quizAnswers: data.quizAnswers,
            photoUrls: data.photoUrls,
          })
          .onConflictDoUpdate({
            target: vibeProfiles.userId,
            set: {
              vibeName: data.vibeName,
              vibeSummary: data.vibeSummary,
              energy: data.energy,
              moodTags: data.moodTags,
              styleTags: data.styleTags,
              interestTags: data.interestTags,
              quizAnswers: data.quizAnswers,
              photoUrls: data.photoUrls,
              isActive: true,
              updatedAt: new Date(),
            },
          })
          .returning();

        // Inside the same transaction as the insert: a profile that exists
        // without a vector is invisible to matching, so the two belong together.
        await embedAndStoreProfile(tx, ctx.user.id, {
          vibeName: data.vibeName,
          vibeSummary: data.vibeSummary,
          energy: data.energy,
          moodTags: data.moodTags,
          styleTags: data.styleTags,
          interestTags: data.interestTags,
        });

        return rows;
      });

      return { profile: saved, meta };
    } catch (error) {
      logger.error("generateVibe failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to generate vibe profile",
      });
    }
  });
