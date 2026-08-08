/**
 * Missions — Mobile REST routes
 * Sub-domains: templates, instances, progress
 */

import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import {
  missionTemplates,
  missionInstances,
  userMissionProgress,
} from "@/services/missions/schema";
import { vibeMatches } from "@/services/social/schema";
import type { AuthEnv } from "../middleware";
import { withRls } from "../secure-db";

const app = new Hono<AuthEnv>();

/**
 * The ids of both people a mission belongs to, or null if it has no match.
 *
 * Exists because `progress.every(...)` is the wrong test for "everyone is
 * done". `every()` returns true for an empty or partial array, and the
 * user_mission_progress SELECT policy was self-scoped until migration 00014, so
 * that query returned only the caller's own row — the row they had just written
 * one statement earlier. Every solo accept or check-in therefore satisfied a
 * two-person mission and paid out both sides.
 *
 * 00014 widens the policy so both rows are visible, but a correctness invariant
 * should not rest on a policy staying exactly right. Deriving the expected
 * participants from the match makes a missing row read as "not done yet"
 * instead of "unanimously done".
 */
async function getMissionParticipants(
  tx: Parameters<Parameters<typeof withRls>[1]>[0],
  instanceId: string,
): Promise<string[] | null> {
  const [row] = await tx
    .select({ userAId: vibeMatches.userAId, userBId: vibeMatches.userBId })
    .from(missionInstances)
    .innerJoin(vibeMatches, eq(vibeMatches.id, missionInstances.matchId))
    .where(eq(missionInstances.id, instanceId))
    .limit(1);

  if (!row) return null;
  return [row.userAId, row.userBId];
}

// ════════════════════════════════════════════════════════════════════════
// Templates
// ════════════════════════════════════════════════════════════════════════

// GET /missions/templates?type=icebreaker&difficulty=easy&limit=20
app.get("/templates", async (c) => {
  const type = c.req.query("type") as
    | "icebreaker"
    | "mini_date"
    | "adventure"
    | "challenge"
    | undefined;
  const difficulty = c.req.query("difficulty") as
    | "easy"
    | "medium"
    | "hard"
    | undefined;
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 50);

  let conditions = eq(missionTemplates.isActive, true);
  if (type)
    conditions = and(conditions, eq(missionTemplates.missionType, type))!;
  if (difficulty)
    conditions = and(conditions, eq(missionTemplates.difficulty, difficulty))!;

  const rows = await withRls(c, (tx) =>
    tx.select().from(missionTemplates).where(conditions).limit(limit),
  );

  return c.json({ data: rows });
});

// GET /missions/templates/:id
app.get("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const [template] = await withRls(c, (tx) =>
    tx
      .select()
      .from(missionTemplates)
      .where(eq(missionTemplates.id, id))
      .limit(1),
  );
  return c.json({ data: template ?? null });
});

// ════════════════════════════════════════════════════════════════════════
// Instances
// ════════════════════════════════════════════════════════════════════════

// POST /missions/instances — propose
app.post("/instances", async (c) => {
  const body = await c.req.json<{
    templateId: string;
    matchId: string;
    customTitle?: string;
    customObjectives?: Array<{ step: number; task: string }>;
    locationName?: string;
    locationLat?: number;
    locationLng?: number;
    locationPlaceId?: string;
  }>();

  const userId = c.var.userId;

  // Ownership check, instance and progress rows are one operation and share a
  // transaction. Separately, the ownership check could pass and the insert
  // still land after the match changed underneath it, and an instance whose
  // progress rows failed to insert would be permanently uncompletable — nobody
  // can check in against a row that does not exist.
  const result = await withRls(c, async (tx) => {
    // Ownership check: the caller must be a participant in the match this
    // instance is being attached to.
    const [owned] = await tx.execute(sql`
      SELECT id FROM vibe_matches
      WHERE id = ${body.matchId}
        AND (user_a_id = ${userId} OR user_b_id = ${userId})
      LIMIT 1
    `);
    if (!owned) return { notFound: true } as const;

    const [created] = await tx
      .insert(missionInstances)
      .values({
        templateId: body.templateId,
        matchId: body.matchId,
        customTitle: body.customTitle,
        customObjectives: body.customObjectives,
        locationName: body.locationName,
        locationLat: body.locationLat,
        locationLng: body.locationLng,
        locationPlaceId: body.locationPlaceId,
        status: "proposed",
      })
      .returning();

    // Create progress entries for both users in the match
    const [match] = await tx
      .select()
      .from(vibeMatches)
      .where(eq(vibeMatches.id, body.matchId))
      .limit(1);

    if (match) {
      await tx.insert(userMissionProgress).values([
        { instanceId: created.id, userId: match.userAId },
        { instanceId: created.id, userId: match.userBId },
      ]);
    }

    return { created };
  });

  if ("notFound" in result) return c.json({ error: "Not found" }, 404);

  return c.json({ data: result.created }, 201);
});

// GET /missions/instances?status=active&limit=20
app.get("/instances", async (c) => {
  const userId = c.var.userId;
  const status = c.req.query("status");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 50);

  const result = await withRls(c, (tx) =>
    tx.execute(sql`
    SELECT mi.*, mt.title as template_title, mt.mission_type, mt.difficulty, mt.base_points
    FROM mission_instances mi
    JOIN mission_templates mt ON mi.template_id = mt.id
    JOIN vibe_matches vm ON mi.match_id = vm.id
    WHERE (vm.user_a_id = ${userId} OR vm.user_b_id = ${userId})
    ${status ? sql`AND mi.status = ${status}` : sql``}
    ORDER BY mi.created_at DESC
    LIMIT ${limit}
  `),
  );

  return c.json({ data: result });
});

// POST /missions/instances/:id/accept
app.post("/instances/:id/accept", async (c) => {
  const userId = c.var.userId;
  const instanceId = c.req.param("id");

  // The accept write, the tally it feeds and the instance transition that tally
  // decides are one operation and share a transaction. Run apart, a partner
  // accepting at the same moment can leave the tally reading a state that no
  // longer matches what was written, and the instance can miss its transition.
  const instance = await withRls(c, async (tx) => {
    await tx
      .update(userMissionProgress)
      .set({ hasAccepted: true, updatedAt: new Date() })
      .where(
        and(
          eq(userMissionProgress.instanceId, instanceId),
          eq(userMissionProgress.userId, userId),
        ),
      );

    const progress = await tx
      .select()
      .from(userMissionProgress)
      .where(eq(userMissionProgress.instanceId, instanceId));

    const participants = await getMissionParticipants(tx, instanceId);
    const accepted = new Set(
      progress.filter((p) => p.hasAccepted).map((p) => p.userId),
    );
    const allAccepted = Boolean(
      participants?.length && participants.every((id) => accepted.has(id)),
    );

    if (allAccepted) {
      const [updated] = await tx
        .update(missionInstances)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(missionInstances.id, instanceId))
        .returning();
      return updated;
    }

    const [current] = await tx
      .select()
      .from(missionInstances)
      .where(eq(missionInstances.id, instanceId))
      .limit(1);

    return current;
  });

  // An instance the caller cannot see under RLS is indistinguishable from one
  // that does not exist; both should read as 404 rather than a 200 with an
  // empty body.
  if (!instance) {
    return c.json({ error: "Mission instance not found" }, 404);
  }

  return c.json({ data: instance });
});

// POST /missions/instances/:id/start
app.post("/instances/:id/start", async (c) => {
  const instanceId = c.req.param("id");
  const userId = c.var.userId;

  // Check and write share a transaction so the ownership decision cannot go
  // stale between the two statements.
  const updated = await withRls(c, async (tx) => {
    // Ownership check. Without this any authenticated user could start any
    // other pair's mission just by knowing its id.
    const [owned] = await tx.execute(sql`
      SELECT mi.id FROM mission_instances mi
      JOIN vibe_matches vm ON vm.id = mi.match_id
      WHERE mi.id = ${instanceId}
        AND (vm.user_a_id = ${userId} OR vm.user_b_id = ${userId})
      LIMIT 1
    `);
    if (!owned) return undefined;

    const [started] = await tx
      .update(missionInstances)
      .set({ status: "active", startedAt: new Date() })
      .where(
        and(
          eq(missionInstances.id, instanceId),
          eq(missionInstances.status, "accepted"),
        ),
      )
      .returning();
    return started;
  });

  // Covers both misses: not a participant, and an instance that was not in the
  // "accepted" state the update requires. Either way nothing was started, which
  // the old unconditional 200 hid.
  if (!updated) return c.json({ error: "Not found" }, 404);

  return c.json({ data: updated });
});

// POST /missions/instances/:id/decline
app.post("/instances/:id/decline", async (c) => {
  const instanceId = c.req.param("id");
  const userId = c.var.userId;

  // Check and write share a transaction, as in /start above.
  const updated = await withRls(c, async (tx) => {
    const [owned] = await tx.execute(sql`
      SELECT mi.id FROM mission_instances mi
      JOIN vibe_matches vm ON vm.id = mi.match_id
      WHERE mi.id = ${instanceId}
        AND (vm.user_a_id = ${userId} OR vm.user_b_id = ${userId})
      LIMIT 1
    `);
    if (!owned) return undefined;

    const [declined] = await tx
      .update(missionInstances)
      .set({ status: "declined" })
      .where(
        and(
          eq(missionInstances.id, instanceId),
          eq(missionInstances.status, "proposed"),
        ),
      )
      .returning();
    return declined;
  });

  // Not a participant, or an instance no longer in "proposed" — nothing was
  // declined either way.
  if (!updated) return c.json({ error: "Not found" }, 404);

  return c.json({ data: updated });
});

// ════════════════════════════════════════════════════════════════════════
// Progress
// ════════════════════════════════════════════════════════════════════════

// POST /missions/progress/:instanceId/objective
app.post("/progress/:instanceId/objective", async (c) => {
  const userId = c.var.userId;
  const instanceId = c.req.param("instanceId");
  const { step } = await c.req.json<{ step: number }>();

  const result = await withRls(c, (tx) =>
    tx.execute(sql`
    UPDATE user_mission_progress
    SET objectives_done = objectives_done || ${JSON.stringify([{ step, done: true, ts: new Date().toISOString() }])}::jsonb,
        updated_at = NOW()
    WHERE instance_id = ${instanceId}
      AND user_id = ${userId}
    RETURNING *
  `),
  );

  return c.json({ data: result });
});

// POST /missions/progress/:instanceId/checkin
app.post("/progress/:instanceId/checkin", async (c) => {
  const userId = c.var.userId;
  const instanceId = c.req.param("instanceId");
  const { proof } = await c.req.json<{
    proof: {
      selfieUrl?: string;
      geo?: { lat: number; lng: number };
      ts?: string;
    };
  }>();

  // Check-in, the tally, and the completion write that awards points are one
  // operation and share a transaction. Split, two partners checking in at once
  // can both read "all checked in" and complete the mission twice, and a
  // completion write that fails leaves progress marked done with the instance
  // still active.
  const result = await withRls(c, async (tx) => {
    await tx
      .update(userMissionProgress)
      .set({ checkedIn: true, updatedAt: new Date() })
      .where(
        and(
          eq(userMissionProgress.instanceId, instanceId),
          eq(userMissionProgress.userId, userId),
        ),
      );

    const progress = await tx
      .select()
      .from(userMissionProgress)
      .where(eq(userMissionProgress.instanceId, instanceId));

    const participants = await getMissionParticipants(tx, instanceId);
    const checkedIn = new Set(
      progress.filter((p) => p.checkedIn).map((p) => p.userId),
    );
    const allCheckedIn = Boolean(
      participants?.length && participants.every((id) => checkedIn.has(id)),
    );

    if (allCheckedIn) {
      const [instance] = await tx
        .select()
        .from(missionInstances)
        .where(eq(missionInstances.id, instanceId))
        .limit(1);

      // The instance can legitimately be absent — deleted, or invisible to this
      // caller under RLS. Reading instance.templateId in that case threw a
      // TypeError and surfaced as a 500 on an otherwise valid request.
      if (!instance) {
        return { notFound: true } as const;
      }

      const [template] = await tx
        .select()
        .from(missionTemplates)
        .where(eq(missionTemplates.id, instance.templateId))
        .limit(1);

      const points = template?.basePoints ?? 100;

      await tx
        .update(missionInstances)
        .set({
          status: "completed",
          completedAt: new Date(),
          pointsAwarded: points,
          checkinProof: proof,
        })
        .where(eq(missionInstances.id, instanceId));

      return { data: { completed: true, pointsAwarded: points } };
    }

    return { data: { completed: false, waitingForPartner: true } };
  });

  if ("notFound" in result) {
    return c.json({ error: "Mission instance not found" }, 404);
  }

  return c.json({ data: result.data });
});

// GET /missions/progress/:instanceId
app.get("/progress/:instanceId", async (c) => {
  const userId = c.var.userId;
  const instanceId = c.req.param("instanceId");

  const [progress] = await withRls(c, (tx) =>
    tx
      .select()
      .from(userMissionProgress)
      .where(
        and(
          eq(userMissionProgress.instanceId, instanceId),
          eq(userMissionProgress.userId, userId),
        ),
      )
      .limit(1),
  );

  return c.json({ data: progress ?? null });
});

export default app;
