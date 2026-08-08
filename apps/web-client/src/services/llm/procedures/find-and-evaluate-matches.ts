/**
 * Pipeline 3b: Batch — Find & evaluate top similar profiles via pgvector
 */

import { authedProcedure } from "@/server/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, sql, and } from "drizzle-orm";
import { vibeProfiles } from "@/services/vibe-profiles/schema";
import { vibeMatches } from "@/services/social/schema";
import { evaluateMatch, type ProfileSummary } from "../client";
import { logger } from "@/lib/logger";

// ── Input ───────────────────────────────────────────────────────────────

export const batchEvaluateInput = z.object({
  limit: z.number().int().min(1).max(10).default(5),
  // 0.5, not 0.7: real text-embedding-3-small vectors put two distinct people
  // at roughly 0.55-0.70, so the old default filtered out essentially every
  // genuine match. See the note in vibe-profiles/procedures/validation.ts.
  threshold: z.number().min(0).max(1).default(0.5),
  useMock: z.boolean().optional().default(false),
});

// ── Procedure ───────────────────────────────────────────────────────────

export const findAndEvaluateMatches = authedProcedure
  .input(batchEvaluateInput)
  .mutation(async ({ ctx, input }) => {
    try {
      // 1. Fetch my profile
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
          message: "You must create a Vibe Profile first.",
        });
      }

      // 2. Use pgvector to find top N similar profiles
      const candidates = (await ctx.secureDb!.rls(async (tx) => {
        return tx.execute(sql`
          SELECT
            vp.*,
            1 - (vp.embedding <=> (
              SELECT embedding FROM vibe_profiles
              WHERE user_id = ${ctx.user.id} AND is_active = TRUE
            )) AS similarity
          FROM vibe_profiles vp
          WHERE vp.user_id <> ${ctx.user.id}
            AND vp.is_active = TRUE
            AND vp.embedding IS NOT NULL
            AND (
              SELECT embedding FROM vibe_profiles
              WHERE user_id = ${ctx.user.id} AND is_active = TRUE
            ) IS NOT NULL
            AND 1 - (vp.embedding <=> (
              SELECT embedding FROM vibe_profiles
              WHERE user_id = ${ctx.user.id} AND is_active = TRUE
            )) > ${input.threshold}
          ORDER BY vp.embedding <=> (
            SELECT embedding FROM vibe_profiles
            WHERE user_id = ${ctx.user.id} AND is_active = TRUE
          )
          LIMIT ${input.limit}
        `);
      })) as Array<Record<string, unknown>>;

      if (!candidates || candidates.length === 0) {
        return { matches: [], message: "No compatible profiles found yet." };
      }

      // 3. Evaluate each candidate with LLM
      const profileA: ProfileSummary = {
        userId: myProfile.userId,
        vibeName: myProfile.vibeName,
        vibeSummary: myProfile.vibeSummary ?? undefined,
        energy: myProfile.energy,
        moodTags: myProfile.moodTags ?? [],
        styleTags: myProfile.styleTags ?? [],
        interestTags: myProfile.interestTags ?? [],
      };

      const results = await Promise.all(
        candidates.map(async (candidate) => {
          const profileB: ProfileSummary = {
            userId: candidate.user_id as string,
            vibeName: candidate.vibe_name as string,
            vibeSummary: (candidate.vibe_summary as string) ?? undefined,
            energy: candidate.energy as ProfileSummary["energy"],
            moodTags: (candidate.mood_tags as string[]) ?? [],
            styleTags: (candidate.style_tags as string[]) ?? [],
            interestTags: (candidate.interest_tags as string[]) ?? [],
          };

          const vectorSimilarity = candidate.similarity as number;

          const { data: compatibility } = await evaluateMatch({
            profileA,
            profileB,
            vectorSimilarity,
            useMock: input.useMock,
          });

          if (compatibility.score > 0.7) {
            await ctx.secureDb!.rls(async (tx) => {
              await tx
                .insert(vibeMatches)
                .values({
                  userAId: ctx.user.id,
                  userBId: profileB.userId,
                  similarity: compatibility.score,
                  compatibility: {
                    narrative: compatibility.narrative,
                    commonGround: compatibility.commonGround,
                    energyCompatibility: compatibility.energyCompatibility,
                    interestOverlap: compatibility.interestOverlap,
                    conversationStarter: compatibility.conversationStarter,
                  },
                })
                .onConflictDoNothing();
            });
          }

          return {
            userId: profileB.userId,
            vibeName: profileB.vibeName,
            vectorSimilarity,
            ...compatibility,
          };
        }),
      );

      return {
        matches: results.sort((a, b) => b.score - a.score),
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error("findAndEvaluateMatches failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to find and evaluate matches",
      });
    }
  });
