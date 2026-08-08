/**
 * Pipeline 3: Compatibility Engine — Evaluate match between two profiles
 */

import { authedProcedure } from "@/server/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, sql, and } from "drizzle-orm";
import { vibeProfiles } from "@/services/vibe-profiles/schema";
import { vibeMatches } from "@/services/social/schema";
import { logger } from "@/lib/logger";
import {
  evaluateMatch as callEvaluateMatch,
  type ProfileSummary,
} from "../client";

// ── Input ───────────────────────────────────────────────────────────────

export const evaluateMatchInput = z.object({
  targetUserId: z.string().min(1),
  useMock: z.boolean().optional().default(false),
});

// ── Helpers ─────────────────────────────────────────────────────────────

function toProfileSummary(profile: {
  userId: string;
  vibeName: string;
  vibeSummary: string | null;
  energy: "chill" | "moderate" | "high" | "chaotic";
  moodTags: string[] | null;
  styleTags: string[] | null;
  interestTags: string[] | null;
}): ProfileSummary {
  return {
    userId: profile.userId,
    vibeName: profile.vibeName,
    vibeSummary: profile.vibeSummary ?? undefined,
    energy: profile.energy,
    moodTags: profile.moodTags ?? [],
    styleTags: profile.styleTags ?? [],
    interestTags: profile.interestTags ?? [],
  };
}

// ── Procedure ───────────────────────────────────────────────────────────

export const evaluateMatchProcedure = authedProcedure
  .input(evaluateMatchInput)
  .mutation(async ({ ctx, input }) => {
    try {
      // 1. Fetch both profiles
      const [myProfile] = await ctx.secureDb!.rls(async (tx) => {
        return tx
          .select()
          .from(vibeProfiles)
          .where(
            and(
              eq(vibeProfiles.userId, ctx.user.id),
              eq(vibeProfiles.isActive, true),
            ),
          )
          .limit(1);
      });

      if (!myProfile) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "You must create a Vibe Profile before evaluating matches.",
        });
      }

      const [targetProfile] = await ctx.secureDb!.rls(async (tx) => {
        return tx
          .select()
          .from(vibeProfiles)
          .where(
            and(
              eq(vibeProfiles.userId, input.targetUserId),
              eq(vibeProfiles.isActive, true),
            ),
          )
          .limit(1);
      });

      if (!targetProfile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target user does not have an active Vibe Profile.",
        });
      }

      // 2. Compute vector similarity if embeddings exist
      let vectorSimilarity: number | undefined;
      try {
        const simResult = await ctx.secureDb!.rls(async (tx) => {
          return tx.execute(sql`
            SELECT 1 - (a.embedding <=> b.embedding) AS similarity
            FROM vibe_profiles a, vibe_profiles b
            WHERE a.user_id = ${ctx.user.id}
              AND b.user_id = ${input.targetUserId}
              AND a.embedding IS NOT NULL
              AND b.embedding IS NOT NULL
          `);
        });
        if (
          Array.isArray(simResult) &&
          simResult.length > 0 &&
          simResult[0] != null &&
          typeof (simResult[0] as Record<string, unknown>).similarity ===
            "number"
        ) {
          vectorSimilarity = (simResult[0] as Record<string, unknown>)
            .similarity as number;
        }
      } catch {
        // Embeddings might not exist yet
      }

      // 3. Build summaries & call LLM
      const profileA = toProfileSummary(myProfile);
      const profileB = toProfileSummary(targetProfile);

      const { data: compatibility, meta } = await callEvaluateMatch({
        profileA,
        profileB,
        vectorSimilarity,
        useMock: input.useMock,
      });

      const effectiveScore =
        compatibility.similarityScore ?? compatibility.score ?? 0;

      // 4. Save vibe match if score > 0.7
      if (effectiveScore > 0.7) {
        await ctx.secureDb!.rls(async (tx) => {
          await tx
            .insert(vibeMatches)
            .values({
              userAId: ctx.user.id,
              userBId: input.targetUserId,
              similarity: effectiveScore,
              compatibility: {
                narrative: compatibility.narrative,
                mission: compatibility.mission,
                successProbability: compatibility.successProbability,
              },
            })
            .onConflictDoNothing();
        });
      }

      return { compatibility, meta, vectorSimilarity };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error("evaluateMatch failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to evaluate match",
      });
    }
  });
