/**
 * Academy Procedures — Levels, Rewards, Leaderboard
 */
import { authedProcedure, createTRPCRouter } from "@/server/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq, sql, and } from "drizzle-orm";
import { academyLevels, academyRewards, userRewards } from "../schema";
import { vibePointsLedger } from "@/services/social/schema";
import { users } from "@/services/users/schema";

// ── Get My Level ────────────────────────────────────────────────────────

const getMyLevel = authedProcedure.query(async ({ ctx }) => {
  // Get total points
  const pointsResult = (await ctx.secureDb!.rls(async (tx) => {
    return tx.execute(sql`
      SELECT COALESCE(SUM(delta), 0)::int as total_points
      FROM vibe_points_ledger
      WHERE user_id = ${ctx.user.id}
    `);
  })) as Array<{ total_points: number }>;

  const totalPoints = pointsResult[0]?.total_points ?? 0;

  // Get all levels ordered by min_points
  const levels = (await ctx.secureDb!.rls(async (tx) => {
    return tx
      .select()
      .from(academyLevels)
      .orderBy(desc(academyLevels.minPoints));
  })) as Array<typeof academyLevels.$inferSelect>;

  // Find current level (highest min_points <= totalPoints)
  const currentLevel =
    levels.find((lvl) => lvl.minPoints <= totalPoints) ??
    levels[levels.length - 1];

  // Find next level
  const sortedAsc = [...levels].reverse();
  const currentIdx = sortedAsc.findIndex((lvl) => lvl.id === currentLevel?.id);
  const nextLevel =
    currentIdx < sortedAsc.length - 1 ? sortedAsc[currentIdx + 1] : null;

  const pointsToNext = nextLevel ? nextLevel.minPoints - totalPoints : 0;
  const progressPercent = nextLevel
    ? Math.min(
        100,
        Math.round(
          ((totalPoints - (currentLevel?.minPoints ?? 0)) /
            (nextLevel.minPoints - (currentLevel?.minPoints ?? 0))) *
            100,
        ),
      )
    : 100;

  return {
    totalPoints,
    currentLevel: currentLevel
      ? {
          id: currentLevel.id,
          name: currentLevel.name,
          minPoints: currentLevel.minPoints,
          badgeIcon: currentLevel.badgeIcon,
          perks: currentLevel.perks as string[],
        }
      : null,
    nextLevel: nextLevel
      ? {
          id: nextLevel.id,
          name: nextLevel.name,
          minPoints: nextLevel.minPoints,
          badgeIcon: nextLevel.badgeIcon,
        }
      : null,
    pointsToNext,
    progressPercent,
  };
});

// ── List All Rewards ────────────────────────────────────────────────────

const listRewards = authedProcedure.query(async ({ ctx }) => {
  return ctx.secureDb!.rls(async (tx) => {
    return tx
      .select()
      .from(academyRewards)
      .where(eq(academyRewards.isActive, true))
      .orderBy(academyRewards.cost);
  });
});

// ── Redeem Reward ───────────────────────────────────────────────────────

const redeemReward = authedProcedure
  .input(z.object({ rewardId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    /**
     * Read the balance, check it, and spend it in ONE transaction.
     *
     * These were three separate `rls()` calls, which means three separate
     * transactions. Two concurrent redemptions both read the pre-spend balance,
     * both passed the check, and both deducted — so a user with 100 points
     * could redeem two 100-point rewards and land at -100. Double-clicking the
     * button was enough to trigger it.
     *
     * The ledger rows are also locked FOR UPDATE while the sum is taken, so a
     * second transaction blocks until this one commits and then sees the real
     * remaining balance rather than a stale one.
     */
    const result = await ctx.secureDb!.rls(async (tx) => {
      const [reward] = (await tx
        .select()
        .from(academyRewards)
        .where(
          and(
            eq(academyRewards.id, input.rewardId),
            eq(academyRewards.isActive, true),
          ),
        )
        .limit(1)) as Array<typeof academyRewards.$inferSelect>;

      if (!reward) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Reward not found or no longer available.",
        });
      }

      const pointsResult = (await tx.execute(sql`
        SELECT COALESCE(SUM(delta), 0)::int AS total_points
        FROM vibe_points_ledger
        WHERE user_id = ${ctx.user.id}
        FOR UPDATE
      `)) as unknown as Array<{ total_points: number }>;

      const totalPoints = pointsResult[0]?.total_points ?? 0;

      if (totalPoints < reward.cost) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Not enough points. You have ${totalPoints} but need ${reward.cost}.`,
        });
      }

      await tx.insert(userRewards).values({
        userId: ctx.user.id,
        rewardId: input.rewardId,
      });

      await tx.insert(vibePointsLedger).values({
        userId: ctx.user.id,
        delta: -reward.cost,
        reason: "reward-redeemed",
        referenceId: input.rewardId,
      });

      return {
        success: true as const,
        reward: reward.title,
        pointsSpent: reward.cost,
        remainingPoints: totalPoints - reward.cost,
      };
    });

    return result;
  });

// ── My Redeemed Rewards ─────────────────────────────────────────────────

const getMyRewards = authedProcedure.query(async ({ ctx }) => {
  return ctx.secureDb!.rls(async (tx) => {
    return tx
      .select({
        id: userRewards.id,
        redeemedAt: userRewards.redeemedAt,
        rewardId: academyRewards.id,
        title: academyRewards.title,
        description: academyRewards.description,
        category: academyRewards.category,
        icon: academyRewards.icon,
        cost: academyRewards.cost,
      })
      .from(userRewards)
      .innerJoin(academyRewards, eq(userRewards.rewardId, academyRewards.id))
      .where(eq(userRewards.userId, ctx.user.id))
      .orderBy(desc(userRewards.redeemedAt));
  });
});

// ── Leaderboard ─────────────────────────────────────────────────────────

const getLeaderboard = authedProcedure
  .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
  .query(async ({ ctx, input }) => {
    const result = (await ctx.secureDb!.rls(async (tx) => {
      return tx.execute(sql`
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.image_url,
          COALESCE(SUM(p.delta), 0)::int as total_points
        FROM users u
        LEFT JOIN vibe_points_ledger p ON p.user_id = u.id
        GROUP BY u.id, u.first_name, u.last_name, u.image_url
        HAVING COALESCE(SUM(p.delta), 0) > 0
        ORDER BY total_points DESC
        LIMIT ${input.limit}
      `);
    })) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      image_url: string | null;
      total_points: number;
    }>;

    return result.map((row, index) => ({
      rank: index + 1,
      userId: row.id,
      displayName:
        [row.first_name, row.last_name].filter(Boolean).join(" ") ||
        "Anonymous",
      imageUrl: row.image_url,
      totalPoints: row.total_points,
    }));
  });

// ── Router ──────────────────────────────────────────────────────────────

export const academyRouter = createTRPCRouter({
  getMyLevel,
  listRewards,
  redeemReward,
  getMyRewards,
  getLeaderboard,
});
