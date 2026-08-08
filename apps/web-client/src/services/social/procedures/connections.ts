import { TRPCError } from "@trpc/server";
import { authedProcedure } from "@/server/init";
import { z } from "zod";
import { connections } from "../schema";
import { eq, and, or, desc } from "drizzle-orm";

export const listConnections = authedProcedure
  .input(
    z
      .object({
        status: z.enum(["pending", "accepted", "blocked"]).optional(),
      })
      .default({}),
  )
  .query(async ({ ctx, input }) => {
    return ctx.secureDb!.rls(async (tx) => {
      let query = tx
        .select()
        .from(connections)
        .where(
          or(
            eq(connections.requesterId, ctx.user.id),
            eq(connections.addresseeId, ctx.user.id),
          ),
        )
        .orderBy(desc(connections.createdAt));

      if (input.status) {
        query = tx
          .select()
          .from(connections)
          .where(
            and(
              or(
                eq(connections.requesterId, ctx.user.id),
                eq(connections.addresseeId, ctx.user.id),
              ),
              eq(connections.status, input.status),
            ),
          )
          .orderBy(desc(connections.createdAt));
      }

      return query;
    });
  });

export const sendRequest = authedProcedure
  .input(z.object({ userId: z.string().min(1) }))
  .mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.id) {
      throw new Error("Cannot send connection request to yourself");
    }

    return ctx.secureDb!.rls(async (tx) => {
      const [existingOutgoing] = await tx
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.requesterId, ctx.user.id),
            eq(connections.addresseeId, input.userId),
          ),
        )
        .limit(1);

      if (existingOutgoing) {
        return {
          ...existingOutgoing,
          mutual: existingOutgoing.status === "accepted",
          targetUserId: input.userId,
        };
      }

      const [incomingPending] = await tx
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.requesterId, input.userId),
            eq(connections.addresseeId, ctx.user.id),
            eq(connections.status, "pending"),
          ),
        )
        .orderBy(desc(connections.createdAt))
        .limit(1);

      if (incomingPending) {
        const now = new Date();

        const [acceptedIncoming] = await tx
          .update(connections)
          .set({
            status: "accepted",
            updatedAt: now,
          })
          .where(eq(connections.id, incomingPending.id))
          .returning();

        const [createdAccepted] = await tx
          .insert(connections)
          .values({
            requesterId: ctx.user.id,
            addresseeId: input.userId,
            status: "accepted",
            updatedAt: now,
          })
          .returning();

        return {
          ...(createdAccepted ?? acceptedIncoming),
          mutual: true,
          targetUserId: input.userId,
        };
      }

      const [created] = await tx
        .insert(connections)
        .values({
          requesterId: ctx.user.id,
          addresseeId: input.userId,
        })
        .returning();

      return {
        ...created,
        mutual: false,
        targetUserId: input.userId,
      };
    });
  });

export const updateConnection = authedProcedure
  .input(
    z.object({
      connectionId: z.uuid(),
      status: z.enum(["accepted", "blocked"]),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const [updated] = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .update(connections)
        .set({
          status: input.status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(connections.id, input.connectionId),
            // Accepting is the addressee's decision alone. Allowing either
            // party through here let a requester accept their own outgoing
            // request, which defeats the consent step entirely. Blocking stays
            // available to both sides.
            input.status === "accepted"
              ? eq(connections.addresseeId, ctx.user.id)
              : or(
                  eq(connections.requesterId, ctx.user.id),
                  eq(connections.addresseeId, ctx.user.id),
            ),
          ),
        )
        .returning();
    });
    return updated;
  });

export const removeConnection = authedProcedure
  .input(z.object({ connectionId: z.uuid() }))
  .mutation(async ({ ctx, input }) => {
    // .returning() so a no-op delete is detectable rather than reported as
    // success — under RLS an unreachable row looks exactly like a missing one.
    const deleted = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .delete(connections)
        .where(
          and(
            eq(connections.id, input.connectionId),
            eq(connections.requesterId, ctx.user.id),
          ),
        )
        .returning({ id: connections.id });
    });

    if (!deleted.length) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Connection not found",
      });
    }

    return { success: true };
  });
