import { TRPCError } from "@trpc/server";
import { authedProcedure, publicProcedure } from "@/server/init";
import { z } from "zod";
import { examples } from "../schema";
import { eq, and, or, desc } from "drizzle-orm";

export const list = authedProcedure.query(async ({ ctx }) => {
  return ctx.secureDb!.rls(async (tx) => {
    return tx
      .select()
      .from(examples)
      .where(or(eq(examples.userId, ctx.user.id), eq(examples.isPublic, true)))
      .orderBy(desc(examples.createdAt));
  });
});

export const getById = authedProcedure
  .input(z.object({ id: z.uuid() }))
  .query(async ({ ctx, input }) => {
    const [example] = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .select()
        .from(examples)
        .where(
          and(
            eq(examples.id, input.id),
            or(eq(examples.userId, ctx.user.id), eq(examples.isPublic, true)),
          ),
        )
        .limit(1);
    });
    return example ?? null;
  });

export const create = authedProcedure
  .input(
    z.object({
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      isPublic: z.boolean().default(false),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const [created] = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .insert(examples)
        .values({
          userId: ctx.user.id,
          title: input.title,
          description: input.description,
          isPublic: input.isPublic,
        })
        .returning();
    });
    return created;
  });

export const update = authedProcedure
  .input(
    z.object({
      id: z.uuid(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      isPublic: z.boolean().optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const [updated] = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .update(examples)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(examples.id, id), eq(examples.userId, ctx.user.id)))
        .returning();
    });
    return updated;
  });

export const deleteExample = authedProcedure
  .input(z.object({ id: z.uuid() }))
  .mutation(async ({ ctx, input }) => {
    // .returning() so a delete that matched nothing is detectable. Under RLS a
    // row the caller cannot see is indistinguishable from one that is absent,
    // and both used to report success.
    const deleted = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .delete(examples)
        .where(and(eq(examples.id, input.id), eq(examples.userId, ctx.user.id)))
        .returning({ id: examples.id });
    });

    if (!deleted.length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Example not found" });
    }

    return { success: true };
  });

/**
 * The one deliberate use of the unscoped client.
 *
 * Every other data path goes through `ctx.secureDb.rls()`, because without
 * request.jwt.claims the `crushie_app` role sees nothing. This is a
 * publicProcedure with no caller identity to set, and it reads only rows that
 * are public by definition — which the `examples` SELECT policy also permits
 * via its `OR is_public = TRUE` arm, so RLS still agrees with the predicate
 * rather than being bypassed by it.
 */
export const listPublic = publicProcedure.query(async ({ ctx }) => {
  return ctx.db
    .select()
    .from(examples)
    .where(eq(examples.isPublic, true))
    .orderBy(desc(examples.createdAt));
});
