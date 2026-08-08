/**
 * Get Analyzer History — Cursor-based paginated list of past sessions
 */

import { authedProcedure } from "@/server/init";
import { z } from "zod";
import { desc, lt, eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { analyzerSessions } from "@/services/verification/schema";
import { logger } from "@/lib/logger";

export const getAnalyzerHistoryInput = z.object({
  /** Cursor: createdAt of the last item (ISO string) for pagination */
  cursor: z.string().datetime().optional(),
  limit: z.number().min(1).max(50).optional().default(12),
});

export const getAnalyzerHistory = authedProcedure
  .input(getAnalyzerHistoryInput)
  .query(async ({ ctx, input }) => {
    try {
      const conditions = [eq(analyzerSessions.userId, ctx.user.id)];

      if (input.cursor) {
        conditions.push(lt(analyzerSessions.createdAt, new Date(input.cursor)));
      }

      const sessions = await ctx.secureDb!.rls(async (tx) => {
        return tx
          .select({
            id: analyzerSessions.id,
            predictedStyle: analyzerSessions.predictedStyle,
            vibePrediction: analyzerSessions.vibePrediction,
            city: analyzerSessions.city,
            createdAt: analyzerSessions.createdAt,
          })
          .from(analyzerSessions)
          .where(and(...conditions))
          .orderBy(desc(analyzerSessions.createdAt))
          .limit(input.limit + 1); // +1 to detect if there's a next page
      });

      const hasMore = sessions.length > input.limit;
      const items = hasMore ? sessions.slice(0, input.limit) : sessions;
      const nextCursor = hasMore
        ? items[items.length - 1]?.createdAt.toISOString()
        : undefined;

      return {
        items: items.map((s) => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
        })),
        nextCursor,
      };
    } catch (error) {
      logger.error("getAnalyzerHistory failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch analyzer history",
      });
    }
  });
