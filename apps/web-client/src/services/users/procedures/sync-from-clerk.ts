import { authedProcedure } from "@/server/init";
import { users } from "../schema";

/**
 * Mirror the caller's Clerk profile into the local users row.
 *
 * Two things were wrong here. It used the unscoped `ctx.db`, which sets no
 * request.jwt.claims, so with RLS enforced the SELECT returned nothing — every
 * call fell through to the INSERT, which then either failed the users INSERT
 * policy or collided on the primary key with the row `authedProcedure` had
 * already upserted moments earlier. And the read, the update and the insert
 * were three separate statements with no transaction, so two concurrent calls
 * could both observe "absent" and both insert.
 *
 * Now it runs as one RLS-scoped transaction and lets Postgres resolve the race:
 * a single upsert is atomic, so concurrent calls serialise instead of one of
 * them erroring.
 */
export const syncFromClerk = authedProcedure.mutation(async ({ ctx }) => {
  const clerkUser = ctx.user;
  const email = clerkUser.emailAddresses[0]?.emailAddress;

  return ctx.secureDb!.rls(async (tx) => {
    const [synced] = await tx
      .insert(users)
      .values({
        id: clerkUser.id,
        email: email ?? "",
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          // Clerk is the source of truth for names and avatar, but not for a
          // missing email: if Clerk has none, keep whatever is already stored
          // rather than overwriting a real address with an empty string.
          ...(email ? { email } : {}),
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          imageUrl: clerkUser.imageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();

    return synced;
  });
});
