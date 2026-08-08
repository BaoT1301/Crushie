import { authedProcedure } from "@/server/init";
import { z } from "zod";
import { vibeMatches } from "../schema";
import { eq, or, desc, sql, inArray } from "drizzle-orm";
import { users } from "@/services/users/schema";
import { vibeProfiles } from "@/services/vibe-profiles/schema";

type MatchUserProfile = {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  gender: string | null;
  imageUrl: string | null;
  vibeName: string | null;
  vibeSummary: string | null;
  bio: string | null;
  energy: string | null;
  photoUrls: string[];
  interestTags: string[];
  interestedIn: string | null;
  isVerified: boolean;
  /** Seeded sample profile rather than a person. See buildProfile. */
  isDemo: boolean;
};

function buildProfile(
  userId: string,
  userRow: any | undefined,
  vibeRow: any | undefined,
): MatchUserProfile {
  return {
    id: userId,
    displayName:
      [userRow?.firstName, userRow?.lastName].filter(Boolean).join(" ") ||
      "Anonymous",
    firstName: userRow?.firstName ?? null,
    lastName: userRow?.lastName ?? null,
    gender: vibeRow?.gender ?? userRow?.gender ?? null,
    imageUrl: userRow?.imageUrl ?? null,
    vibeName: vibeRow?.vibeName ?? null,
    vibeSummary: vibeRow?.vibeSummary ?? null,
    bio: vibeRow?.bio ?? null,
    energy: vibeRow?.energy ?? null,
    photoUrls: vibeRow?.photoUrls ?? [],
    interestTags: vibeRow?.interestTags ?? [],
    interestedIn: vibeRow?.interestedIn ?? null,
    isVerified: userRow?.isVerified ?? false,
    // Seeded sample profile. Surfaced so the chat header can label it — that is
    // where someone would otherwise wait for a reply from what they assume is a
    // person. Derived from the `demo_` id prefix migration 00011 assigns.
    isDemo: userId.startsWith("demo_"),
  };
}

export const listMatches = authedProcedure
  .input(
    z
      .object({
        limit: z.number().int().min(1).max(50).default(20),
      })
      .default({ limit: 20 }),
  )
  .query(async ({ ctx, input }) => {
    const rawMatches = (await ctx.secureDb!.rls(async (tx) => {
      return tx
        .select()
        .from(vibeMatches)
        .where(
          or(
            eq(vibeMatches.userAId, ctx.user.id),
            eq(vibeMatches.userBId, ctx.user.id),
          ),
        )
        .orderBy(desc(vibeMatches.matchedAt))
        .limit(input.limit);
    })) as Array<typeof vibeMatches.$inferSelect>;

    if (!rawMatches.length) return [];

    // Collect all unique user IDs from matches
    const userIds = [
      ...new Set(rawMatches.flatMap((m) => [m.userAId, m.userBId])),
    ];

    // Fetch user records
    const userRows = (await ctx.secureDb!.rls(async (tx) => {
      return tx.select().from(users).where(inArray(users.id, userIds));
    })) as Array<typeof users.$inferSelect>;

    // Fetch vibe profiles
    const vibeRows = (await ctx.secureDb!.rls(async (tx) => {
      return tx
        .select()
        .from(vibeProfiles)
        .where(inArray(vibeProfiles.userId, userIds));
    })) as Array<typeof vibeProfiles.$inferSelect>;

    const userMap = new Map(userRows.map((u) => [u.id, u]));
    const vibeMap = new Map(vibeRows.map((v) => [v.userId, v]));

    return rawMatches.map((match) => ({
      ...match,
      userA: buildProfile(
        match.userAId,
        userMap.get(match.userAId),
        vibeMap.get(match.userAId),
      ),
      userB: buildProfile(
        match.userBId,
        userMap.get(match.userBId),
        vibeMap.get(match.userBId),
      ),
    }));
  });

export const checkMutuals = authedProcedure
  .input(z.object({ targetUserId: z.string() }))
  .query(async ({ ctx, input }) => {
    const result = await ctx.secureDb!.rls(async (tx) => {
      return tx.execute(
        sql`SELECT * FROM check_mutual_connections(${ctx.user.id}, ${input.targetUserId})`,
      );
    });
    return result;
  });
