/**
 * Vibe Profiles — Mobile REST routes
 */

import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import { vibeProfiles } from "@/services/vibe-profiles/schema";
import { embedAndStoreProfile } from "@/services/vibe-profiles/embedding";
import type { AuthEnv } from "../middleware";
import { withRls } from "../secure-db";

const app = new Hono<AuthEnv>();

// GET /vibe-profiles/me
app.get("/me", async (c) => {
  const userId = c.var.userId;
  const [profile] = await withRls(c, (tx) =>
    tx
      .select()
      .from(vibeProfiles)
      .where(eq(vibeProfiles.userId, userId))
      .limit(1),
  );
  return c.json({ data: profile ?? null });
});

// POST /vibe-profiles — create (upsert)
app.post("/", async (c) => {
  const userId = c.var.userId;
  const body = await c.req.json<{
    vibeName: string;
    vibeSummary?: string;
    energy?: "chill" | "moderate" | "high" | "chaotic";
    moodTags?: string[];
    styleTags?: string[];
    interestTags?: string[];
    quizAnswers?: Record<string, unknown>;
    photoUrls?: string[];
  }>();

  // Deactivate-then-upsert is a single operation and must share a transaction:
  // if the upsert fails on its own, a rolled-back deactivate leaves the user
  // with the profile they had rather than with no active profile at all.
  const [created] = await withRls(c, async (tx) => {
    // Deactivate previous profile
    await tx
      .update(vibeProfiles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(vibeProfiles.userId, userId));

    const rows = await tx
      .insert(vibeProfiles)
      .values({
        userId,
        vibeName: body.vibeName,
        vibeSummary: body.vibeSummary,
        energy: body.energy ?? "moderate",
        moodTags: body.moodTags ?? [],
        styleTags: body.styleTags ?? [],
        interestTags: body.interestTags ?? [],
        quizAnswers: body.quizAnswers ?? {},
        photoUrls: body.photoUrls ?? [],
      })
      .onConflictDoUpdate({
        target: vibeProfiles.userId,
        set: {
          vibeName: body.vibeName,
          vibeSummary: body.vibeSummary,
          energy: body.energy ?? "moderate",
          moodTags: body.moodTags ?? [],
          styleTags: body.styleTags ?? [],
          interestTags: body.interestTags ?? [],
          quizAnswers: body.quizAnswers ?? {},
          photoUrls: body.photoUrls ?? [],
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Same transaction as the upsert: without a vector this profile is
    // invisible to every similarity query.
    await embedAndStoreProfile(tx, userId, {
      vibeName: body.vibeName,
      vibeSummary: body.vibeSummary,
      energy: body.energy ?? "moderate",
      moodTags: body.moodTags ?? [],
      styleTags: body.styleTags ?? [],
      interestTags: body.interestTags ?? [],
    });

    return rows;
  });

  return c.json({ data: created }, 201);
});

// PATCH /vibe-profiles — update current profile
app.patch("/", async (c) => {
  const userId = c.var.userId;
  const body = await c.req.json<{
    vibeName?: string;
    vibeSummary?: string;
    energy?: "chill" | "moderate" | "high" | "chaotic";
    moodTags?: string[];
    styleTags?: string[];
    interestTags?: string[];
    quizAnswers?: Record<string, unknown>;
    photoUrls?: string[];
  }>();

  const [updated] = await withRls(c, (tx) =>
    tx
      .update(vibeProfiles)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(vibeProfiles.userId, userId))
      .returning(),
  );

  // Report the miss rather than 200-ing on a write that did not land — a caller
  // with no profile yet should be told to create one, not handed an empty body.
  if (!updated) {
    return c.json({ error: "Vibe profile not found" }, 404);
  }

  return c.json({ data: updated });
});

// POST /vibe-profiles/similar — pgvector similarity search
app.post("/similar", async (c) => {
  const userId = c.var.userId;
  const body = await c.req.json<{
    limit?: number;
    threshold?: number;
  }>();

  const limit = Math.min(body.limit ?? 10, 50);
  // 0.5 matches the tRPC default. Real embeddings put two distinct people at
  // roughly 0.55-0.70, so 0.7 returned nothing. See the note in
  // services/vibe-profiles/procedures/validation.ts.
  const threshold = body.threshold ?? 0.5;

  const result = await withRls(c, (tx) =>
    tx.execute(sql`
    SELECT * FROM find_similar_vibes(
      (SELECT embedding FROM vibe_profiles WHERE user_id = ${userId} AND is_active = TRUE),
      ${limit},
      ${threshold}
    )
    WHERE user_id <> ${userId}
  `),
  );

  return c.json({ data: result });
});

// GET /vibe-profiles/user/:userId — get another user's public profile
app.get("/user/:userId", async (c) => {
  const targetUserId = c.req.param("userId");
  const [profile] = await withRls(c, (tx) =>
    tx
      .select({
        id: vibeProfiles.id,
        vibeName: vibeProfiles.vibeName,
        vibeSummary: vibeProfiles.vibeSummary,
        energy: vibeProfiles.energy,
        moodTags: vibeProfiles.moodTags,
        interestTags: vibeProfiles.interestTags,
      })
      .from(vibeProfiles)
      // isActive matters: the RLS policy this route mirrors ("Users can read
      // active vibe profiles for matching") scopes to is_active = TRUE, and the
      // predicate is kept explicit so the route reads the same way the policy
      // does rather than relying on it alone.
      .where(
        and(
          eq(vibeProfiles.userId, targetUserId),
          eq(vibeProfiles.isActive, true),
        ),
      )
      .limit(1),
  );

  return c.json({ data: profile ?? null });
});

export default app;
