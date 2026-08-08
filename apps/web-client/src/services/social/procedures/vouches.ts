import { TRPCError } from "@trpc/server";
import { authedProcedure } from "@/server/init";
import { z } from "zod";
import { vibeVouches } from "../schema";
import { eq, and, desc, sql } from "drizzle-orm";

export const getMyVouches = authedProcedure.query(async ({ ctx }) => {
  return ctx.secureDb!.rls(async (tx) => {
    return tx
      .select()
      .from(vibeVouches)
      .where(eq(vibeVouches.subjectId, ctx.user.id))
      .orderBy(desc(vibeVouches.createdAt));
  });
});

export const giveVouch = authedProcedure
  .input(
    z.object({
      subjectId: z.string().min(1),
      tag: z.enum([
        "looks_like_photos",
        "safe_vibes",
        "great_conversation",
        "funny",
        "respectful",
        "adventurous",
        "good_listener",
        "creative",
      ]),
      isAnonymous: z.boolean().default(true),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const [created] = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .insert(vibeVouches)
        .values({
          voucherId: ctx.user.id,
          subjectId: input.subjectId,
          tag: input.tag,
          isAnonymous: input.isAnonymous,
        })
        .returning();
    });
    return created;
  });

export const removeVouch = authedProcedure
  .input(z.object({ vouchId: z.uuid() }))
  .mutation(async ({ ctx, input }) => {
    // .returning() so a no-op delete is detectable rather than reported as
    // success — under RLS an unreachable row looks exactly like a missing one.
    const deleted = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .delete(vibeVouches)
        .where(
          and(
            eq(vibeVouches.id, input.vouchId),
            eq(vibeVouches.voucherId, ctx.user.id),
          ),
        )
        .returning({ id: vibeVouches.id });
    });

    if (!deleted.length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Vouch not found" });
    }

    return { success: true };
  });

export const getVouchSummary = authedProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ ctx, input }) => {
    const result = await ctx.secureDb!.rls(async (tx) => {
      return tx.execute(sql`
        SELECT tag, COUNT(*)::int as count
        FROM vibe_vouches
        WHERE subject_id = ${input.userId}
        GROUP BY tag
        ORDER BY count DESC
      `);
    });
    return result;
  });
