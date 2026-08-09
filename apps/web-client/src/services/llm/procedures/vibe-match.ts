/**
 * Pipeline 3: Compatibility Engine — Evaluate match between two profiles
 * FIXED VERSION
 */

import { authedProcedure } from "@/server/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, ne } from "drizzle-orm";
import { vibeProfiles } from "@/services/vibe-profiles/schema";
import { logger } from "@/lib/logger";
import {
  vibeMatch as callVibeMatch,
  type ProfileSummary,
} from "../client";
import { mergeCandidates } from "./merge-candidates";

// ── Input ───────────────────────────────────────────────────────────────

export const vibeMatchInput = z.object({
  limit: z.number().optional().default(10),
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

export const vibeMatchProcedure = authedProcedure
  .input(vibeMatchInput)
  .query(async ({ ctx, input }) => {
    try {
      // 1. Fetch current user's profile
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

      // 2. Fetch all other active profiles
      const otherProfiles = await ctx.secureDb!.rls(async (tx) => {
        return tx
          .select()
          .from(vibeProfiles)
          .where(
            and(
              ne(vibeProfiles.userId, ctx.user.id),
              eq(vibeProfiles.isActive, true),
            ),
          );
      });

      if (!otherProfiles || otherProfiles.length === 0) {
        // Return empty result instead of throwing error
        return {
          data: {
            currentUserId: ctx.user.id,
            matches: [],
            total: 0,
          },
          meta: {
            cached: false,
            message: "No other active profiles found",
          },
        };
      }

      // 3. Build summaries & call LLM
      const profileA = toProfileSummary(myProfile);
      const otherProfileList = otherProfiles.map((elem) =>
        toProfileSummary(elem)
      );

      // Call the LLM service to get compatibility scores
      const res = await callVibeMatch({
        profile: profileA,
        otherUsers: otherProfileList,
        limit: input.limit,
        useMock: input.useMock,
      });

      // 4. Guarantee every active profile comes back, ranked ones first.
      //    See merge-candidates.ts for why the model's own list is not enough.
      const ranked = Array.isArray(res.topMatches) ? res.topMatches : [];
      const topMatches = mergeCandidates(
        ranked,
        otherProfileList,
        ctx.user.id,
      );

      return {
        ...res,
        topMatches,
        meta: {
          ...(res.meta ?? {}),
          rankedCount: ranked.length,
          totalCandidates: topMatches.length,
        },
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error("vibeMatch failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to evaluate matches",
      });
    }
  });