/**
 * Chat Procedures — Direct messaging between matched users
 */
import { authedProcedure, createTRPCRouter } from "@/server/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { directMessages } from "../schema";
import { vibeMatches } from "@/services/social/schema";
import { replyAsPersonaIfDemoMatch } from "../persona-reply";

// ── Helpers ─────────────────────────────────────────────────────────────

async function assertMatchParticipant(
  ctx: {
    user: { id: string };
    secureDb: {
      rls: (cb: (tx: any) => Promise<unknown>) => Promise<unknown>;
    };
  },
  matchId: string,
) {
  // Returns the participants, not just the id: sendMessage needs to know
  // whether the other side is a sample persona, and re-querying for that would
  // be a second round trip for something this row already has.
  const result = (await ctx.secureDb.rls(async (tx) => {
    return tx
      .select({
        id: vibeMatches.id,
        userAId: vibeMatches.userAId,
        userBId: vibeMatches.userBId,
      })
      .from(vibeMatches)
      .where(
        and(
          eq(vibeMatches.id, matchId),
          or(
            eq(vibeMatches.userAId, ctx.user.id),
            eq(vibeMatches.userBId, ctx.user.id),
          ),
        ),
      )
      .limit(1);
  })) as Array<{ id: string; userAId: string; userBId: string }>;

  if (!result.length) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Match not found or not accessible.",
    });
  }

  return result[0];
}

// ── Procedures ──────────────────────────────────────────────────────────

const sendMessage = authedProcedure
  .input(
    z.object({
      matchId: z.string().uuid(),
      content: z.string().min(1).max(2000),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const match = await assertMatchParticipant(ctx as any, input.matchId);

    const [message] = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .insert(directMessages)
        .values({
          matchId: input.matchId,
          senderId: ctx.user.id,
          content: input.content,
        })
        .returning();
    });

    // If the other side is a seeded sample profile, have it answer.
    //
    // Awaited rather than fired off after the response, because on a serverless
    // host nothing is guaranteed to run once the response is sent. It is a
    // short completion on the fast model, and it swallows its own failures, so
    // the worst case is the persona staying quiet — never a lost message.
    //
    // Real-to-real matches skip this entirely.
    await replyAsPersonaIfDemoMatch({
      matchId: input.matchId,
      userAId: match.userAId,
      userBId: match.userBId,
    });

    return message;
  });

const listMessages = authedProcedure
  .input(
    z.object({
      matchId: z.string().uuid(),
      limit: z.number().int().min(1).max(100).default(50),
      cursor: z.string().datetime().optional(),
    }),
  )
  .query(async ({ ctx, input }) => {
    await assertMatchParticipant(ctx as any, input.matchId);

    const messages = (await ctx.secureDb!.rls(async (tx) => {
      const conditions = [eq(directMessages.matchId, input.matchId)];

      if (input.cursor) {
        conditions.push(lt(directMessages.createdAt, new Date(input.cursor)));
      }

      return tx
        .select()
        .from(directMessages)
        .where(and(...conditions))
        .orderBy(desc(directMessages.createdAt))
        .limit(input.limit + 1);
    })) as Array<typeof directMessages.$inferSelect>;

    const hasMore = messages.length > input.limit;
    const items = hasMore ? messages.slice(0, input.limit) : messages;
    const nextCursor = hasMore
      ? items[items.length - 1]?.createdAt?.toISOString()
      : undefined;

    return {
      items: items.reverse(), // chronological order
      nextCursor,
      hasMore,
    };
  });

const getUnreadCount = authedProcedure
  .input(z.object({ matchId: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    await assertMatchParticipant(ctx as any, input.matchId);

    const result = (await ctx.secureDb!.rls(async (tx) => {
      return tx.execute(sql`
        SELECT COUNT(*)::int as count
        FROM direct_messages
        WHERE match_id = ${input.matchId}
          AND sender_id != ${ctx.user.id}
      `);
    })) as Array<{ count: number }>;

    return { unread: result[0]?.count ?? 0 };
  });

// ── Router ──────────────────────────────────────────────────────────────

export const chatRouter = createTRPCRouter({
  sendMessage,
  listMessages,
  getUnreadCount,
});
