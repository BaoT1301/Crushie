/**
 * Social — Mobile REST routes
 * Sub-domains: connections, matches, vouches, crush-list, points
 */

import { Hono } from "hono";
import { eq, and, or, desc, sql } from "drizzle-orm";
import {
  connections,
  vibeMatches,
  vibeVouches,
  crushList,
  vibePointsLedger,
} from "@/services/social/schema";
import type { AuthEnv } from "../middleware";
import { withRls } from "../secure-db";

const app = new Hono<AuthEnv>();

// ════════════════════════════════════════════════════════════════════════
// Connections
// ════════════════════════════════════════════════════════════════════════

// GET /social/connections?status=pending
app.get("/connections", async (c) => {
  const userId = c.var.userId;
  const status = c.req.query("status") as
    | "pending"
    | "accepted"
    | "blocked"
    | undefined;

  const baseCondition = or(
    eq(connections.requesterId, userId),
    eq(connections.addresseeId, userId),
  );

  const whereClause = status
    ? and(baseCondition, eq(connections.status, status))
    : baseCondition;

  const rows = await withRls(c, (tx) =>
    tx
      .select()
      .from(connections)
      .where(whereClause!)
      .orderBy(desc(connections.createdAt)),
  );

  return c.json({ data: rows });
});

// POST /social/connections — send request
app.post("/connections", async (c) => {
  const userId = c.var.userId;
  const { targetUserId } = await c.req.json<{ targetUserId: string }>();

  const [created] = await withRls(c, (tx) =>
    tx
      .insert(connections)
      .values({ requesterId: userId, addresseeId: targetUserId })
      .returning(),
  );

  return c.json({ data: created }, 201);
});

// PATCH /social/connections/:id — accept/block
app.patch("/connections/:id", async (c) => {
  const userId = c.var.userId;
  const connectionId = c.req.param("id");
  const { status } = await c.req.json<{
    status: "accepted" | "blocked";
  }>();

  const [updated] = await withRls(c, (tx) =>
    tx
      .update(connections)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(connections.id, connectionId),
          // Accepting is the addressee's decision alone. Allowing either party
          // through here let a requester accept their own outgoing request,
          // which defeats the consent step. Blocking stays available to both.
          status === "accepted"
            ? eq(connections.addresseeId, userId)
            : or(
                eq(connections.requesterId, userId),
                eq(connections.addresseeId, userId),
              ),
        ),
      )
      .returning(),
  );

  // Report the miss rather than 200-ing on a write that did not land. A caller
  // who is not the addressee now learns their accept was rejected instead of
  // getting an empty body that looks like it worked.
  if (!updated) {
    return c.json({ error: "Connection not found" }, 404);
  }

  return c.json({ data: updated });
});

// DELETE /social/connections/:id
app.delete("/connections/:id", async (c) => {
  const userId = c.var.userId;
  const connectionId = c.req.param("id");

  // .returning() so a no-op delete is detectable. This previously returned
  // {success: true} unconditionally, which under RLS meant every failed delete
  // reported success.
  const deleted = await withRls(c, (tx) =>
    tx
      .delete(connections)
      .where(
        and(
          eq(connections.id, connectionId),
          eq(connections.requesterId, userId),
        ),
      )
      .returning({ id: connections.id }),
  );

  if (!deleted.length) {
    return c.json({ error: "Connection not found" }, 404);
  }

  return c.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════
// Matches
// ════════════════════════════════════════════════════════════════════════

// GET /social/matches?limit=20
app.get("/matches", async (c) => {
  const userId = c.var.userId;
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 50);

  const rows = await withRls(c, (tx) =>
    tx
      .select()
      .from(vibeMatches)
      .where(
        or(eq(vibeMatches.userAId, userId), eq(vibeMatches.userBId, userId)),
      )
      .orderBy(desc(vibeMatches.matchedAt))
      .limit(limit),
  );

  return c.json({ data: rows });
});

// GET /social/matches/mutuals?targetUserId=xxx
app.get("/matches/mutuals", async (c) => {
  const userId = c.var.userId;
  const targetUserId = c.req.query("targetUserId");

  if (!targetUserId) {
    return c.json({ error: "targetUserId query param required" }, 400);
  }

  const result = await withRls(c, (tx) =>
    tx.execute(
      sql`SELECT * FROM check_mutual_connections(${userId}, ${targetUserId})`,
    ),
  );

  return c.json({ data: result });
});

// ════════════════════════════════════════════════════════════════════════
// Vouches
// ════════════════════════════════════════════════════════════════════════

// GET /social/vouches
app.get("/vouches", async (c) => {
  const userId = c.var.userId;
  const rows = await withRls(c, (tx) =>
    tx
      .select()
      .from(vibeVouches)
      .where(eq(vibeVouches.subjectId, userId))
      .orderBy(desc(vibeVouches.createdAt)),
  );
  return c.json({ data: rows });
});

// POST /social/vouches
app.post("/vouches", async (c) => {
  const userId = c.var.userId;
  const body = await c.req.json<{
    subjectId: string;
    tag: string;
    isAnonymous?: boolean;
  }>();

  const [created] = await withRls(c, (tx) =>
    tx
      .insert(vibeVouches)
      .values({
        voucherId: userId,
        subjectId: body.subjectId,
        tag: body.tag as any,
        isAnonymous: body.isAnonymous ?? true,
      })
      .returning(),
  );

  return c.json({ data: created }, 201);
});

// DELETE /social/vouches/:id
app.delete("/vouches/:id", async (c) => {
  const userId = c.var.userId;
  const vouchId = c.req.param("id");

  // .returning() so a no-op delete is detectable — deleting someone else's
  // vouch, or one that no longer exists, previously reported success.
  const deleted = await withRls(c, (tx) =>
    tx
      .delete(vibeVouches)
      .where(and(eq(vibeVouches.id, vouchId), eq(vibeVouches.voucherId, userId)))
      .returning({ id: vibeVouches.id }),
  );

  if (!deleted.length) {
    return c.json({ error: "Vouch not found" }, 404);
  }

  return c.json({ success: true });
});

// GET /social/vouches/summary?userId=xxx
app.get("/vouches/summary", async (c) => {
  const targetUserId = c.req.query("userId");
  if (!targetUserId) {
    return c.json({ error: "userId query param required" }, 400);
  }

  const result = await withRls(c, (tx) =>
    tx.execute(sql`
    SELECT tag, COUNT(*)::int as count
    FROM vibe_vouches
    WHERE subject_id = ${targetUserId}
    GROUP BY tag
    ORDER BY count DESC
  `),
  );

  return c.json({ data: result });
});

// ════════════════════════════════════════════════════════════════════════
// Crush List
// ════════════════════════════════════════════════════════════════════════

// GET /social/crush-list
app.get("/crush-list", async (c) => {
  const userId = c.var.userId;
  const rows = await withRls(c, (tx) =>
    tx
      .select()
      .from(crushList)
      .where(and(eq(crushList.userId, userId), eq(crushList.isActive, true)))
      .orderBy(desc(crushList.createdAt)),
  );
  return c.json({ data: rows });
});

// POST /social/crush-list
app.post("/crush-list", async (c) => {
  const userId = c.var.userId;
  const { crushUserId } = await c.req.json<{ crushUserId: string }>();

  const [created] = await withRls(c, (tx) =>
    tx
      .insert(crushList)
      .values({ userId, crushUserId })
      .onConflictDoUpdate({
        target: [crushList.userId, crushList.crushUserId],
        set: { isActive: true },
      })
      .returning(),
  );

  return c.json({ data: created }, 201);
});

// DELETE /social/crush-list/:id
app.delete("/crush-list/:id", async (c) => {
  const userId = c.var.userId;
  const crushId = c.req.param("id");

  const [updated] = await withRls(c, (tx) =>
    tx
      .update(crushList)
      .set({ isActive: false })
      .where(and(eq(crushList.id, crushId), eq(crushList.userId, userId)))
      .returning(),
  );

  // Soft delete, so the miss is only visible by checking the returned row —
  // without this the caller gets a 200 for an entry that was never deactivated.
  if (!updated) {
    return c.json({ error: "Crush list entry not found" }, 404);
  }

  return c.json({ data: updated });
});

// ════════════════════════════════════════════════════════════════════════
// Points
// ════════════════════════════════════════════════════════════════════════

// GET /social/points
app.get("/points", async (c) => {
  const userId = c.var.userId;
  const result = await withRls(c, (tx) =>
    tx.execute(sql`
    SELECT COALESCE(SUM(delta), 0)::int as total_points
    FROM vibe_points_ledger
    WHERE user_id = ${userId}
  `),
  );
  return c.json({
    data: { totalPoints: (result as any)?.[0]?.total_points ?? 0 },
  });
});

// GET /social/points/history?limit=20
app.get("/points/history", async (c) => {
  const userId = c.var.userId;
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);

  const rows = await withRls(c, (tx) =>
    tx
      .select()
      .from(vibePointsLedger)
      .where(eq(vibePointsLedger.userId, userId))
      .orderBy(desc(vibePointsLedger.createdAt))
      .limit(limit),
  );

  return c.json({ data: rows });
});

export default app;
