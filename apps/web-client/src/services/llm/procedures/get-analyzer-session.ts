/**
 * Get Analyzer Session — Fetch a single session by ID
 */

import { authedProcedure } from "@/server/init";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { analyzerSessions } from "@/services/verification/schema";
import { logger } from "@/lib/logger";

export const getAnalyzerSessionInput = z.object({
  id: z.string().uuid("Invalid session ID"),
});

export const getAnalyzerSession = authedProcedure
  .input(getAnalyzerSessionInput)
  .query(async ({ ctx, input }) => {
    try {
      const [session] = await ctx.secureDb!.rls(async (tx) => {
        return tx
          .select()
          .from(analyzerSessions)
          .where(
            and(
              eq(analyzerSessions.id, input.id),
              eq(analyzerSessions.userId, ctx.user.id),
            ),
          )
          .limit(1);
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Analyzer session not found",
        });
      }

      return {
        ...session,
        createdAt: session.createdAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error("getAnalyzerSession failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch analyzer session",
      });
    }
  });
