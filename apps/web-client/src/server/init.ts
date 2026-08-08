import { db } from "@/db";
import { getSecureDb } from "@/db/secure-client";
import { users } from "@/services/users/schema";
import { currentUser } from "@clerk/nextjs/server";
import { initTRPC, TRPCError } from "@trpc/server";
import { cache } from "react";
import superjson from "superjson";
import { requestContext } from "./request-context";
import { logger } from "@/lib/logger";

/**
 * 1. Context Creation
 * This creates the context that is available to all procedures.
 */
export const createTRPCContext = cache(async () => {
  const user = await currentUser();

  let secureDb = null;
  if (user) {
    try {
      secureDb = await getSecureDb();
    } catch (error) {
      logger.error("Failed to initialize secure DB in TRPC context", error);
    }
  }

  return {
    user,
    db,
    secureDb,
  };
});

/**
 * 2. tRPC Initialization
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,

  /**
   * Keep internal failure detail on the server.
   *
   * tRPC's default shape forwards `error.message` verbatim, and a plain Error
   * thrown inside a procedure keeps whatever text it was constructed with. With
   * RLS enforced, that text is routinely a Postgres error — `new row violates
   * row-level security policy for table "vibe_profiles"`, or a constraint name,
   * or a column list. That is a free schema map for anyone reading the network
   * tab, and it is meaningless to the person it gets shown to.
   *
   * Only INTERNAL_SERVER_ERROR is masked. Everything else — UNAUTHORIZED,
   * NOT_FOUND, BAD_REQUEST, and the zodError below — is a message we chose
   * deliberately for the client, so it passes through unchanged.
   *
   * Masking is production-only: in development the real message is what makes
   * a failure diagnosable.
   */
  errorFormatter({ shape, error }) {
    const isInternal = error.code === "INTERNAL_SERVER_ERROR";
    const isProduction = process.env.NODE_ENV === "production";

    if (isInternal && isProduction) {
      return {
        ...shape,
        message: "Something went wrong. Please try again.",
        data: {
          ...shape.data,
          // stack is already withheld in production by tRPC, but the message
          // is duplicated into data by some clients, so blank it here too.
          stack: undefined,
        },
      };
    }

    return shape;
  },
});

/**
 * 3. Exports
 */
export const createTRPCRouter = t.router;

// Public procedure - no auth required
export const publicProcedure = t.procedure;

// Authed procedure - requires authenticated user
export const authedProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  let secureDb = opts.ctx.secureDb;
  if (!secureDb) {
    try {
      secureDb = await getSecureDb();
    } catch (error) {
      logger.error("Failed to initialize secure DB in authedProcedure", error);
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Unable to establish authenticated database session",
      });
    }
  }

  const clerkUser = opts.ctx.user;

  try {
    const email =
      clerkUser.emailAddresses[0]?.emailAddress ??
      `${clerkUser.id}@placeholder.local`;

    // Runs inside the RLS transaction, not on the unscoped client.
    //
    // This upsert used ctx.db, which never calls set_config('request.jwt.claims'),
    // so public.user_id() evaluated to NULL and the users INSERT policy
    // (WITH CHECK id = public.user_id()) could never match. That was invisible
    // while DATABASE_URL used the BYPASSRLS `postgres` role; the moment a
    // least-privilege role was introduced, every first sign-in failed with
    // "new row violates row-level security policy for table users".
    await secureDb.rls(async (tx) =>
      tx
        .insert(users)
        .values({
          id: clerkUser.id,
          email,
          firstName: clerkUser.firstName ?? undefined,
          lastName: clerkUser.lastName ?? undefined,
          imageUrl: clerkUser.imageUrl ?? undefined,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email,
            firstName: clerkUser.firstName ?? undefined,
            lastName: clerkUser.lastName ?? undefined,
            imageUrl: clerkUser.imageUrl ?? undefined,
            isActive: true,
            updatedAt: new Date(),
          },
        }),
    );
  } catch (error) {
    logger.error("Failed to sync user in authedProcedure middleware", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to sync user account",
    });
  }

  // Everything downstream runs inside this store, so outbound calls to the LLM
  // service can attribute themselves to a user without every helper in between
  // having to take a userId parameter. See server/request-context.ts.
  // `clerkUser`, not `opts.ctx.user`: both refer to the same object, but the
  // null check at the top of this middleware narrows a property access only
  // until it is read inside a closure, where TypeScript has to assume it could
  // have changed. Passing the already-narrowed const keeps ctx.user non-null
  // for every downstream procedure.
  return requestContext.run({ userId: clerkUser.id }, () =>
    opts.next({
      ctx: { ...opts.ctx, user: clerkUser, secureDb },
    }),
  );
});
