/**
 * Verification — Mobile REST routes
 */

import { Hono } from "hono";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  verifications,
  analyzerSessions,
} from "@/services/verification/schema";
import type { AuthEnv } from "../middleware";
import { withRls } from "../secure-db";

const app = new Hono<AuthEnv>();

// ════════════════════════════════════════════════════════════════════════
// Verification Status & Requests
// ════════════════════════════════════════════════════════════════════════

// GET /verification/status
app.get("/status", async (c) => {
  const userId = c.var.userId;
  const rows = await withRls(c, (tx) =>
    tx
      .select()
      .from(verifications)
      .where(eq(verifications.userId, userId))
      .orderBy(desc(verifications.requestedAt)),
  );
  return c.json({ data: rows });
});

// GET /verification/check?type=selfie_liveness
app.get("/check", async (c) => {
  const userId = c.var.userId;
  const type = c.req.query("type") as
    | "selfie_liveness"
    | "photo_match"
    | "phone"
    | "social_vouch"
    | undefined;

  if (!type) return c.json({ error: "type query param required" }, 400);

  const [result] = await withRls(c, (tx) =>
    tx
      .select()
      .from(verifications)
      .where(
        and(
          eq(verifications.userId, userId),
          eq(verifications.type, type),
          eq(verifications.status, "verified"),
        ),
      )
      .limit(1),
  );

  return c.json({ data: { verified: !!result } });
});

// POST /verification/request
app.post("/request", async (c) => {
  const userId = c.var.userId;
  const body = await c.req.json<{
    type: "selfie_liveness" | "photo_match" | "phone" | "social_vouch";
    proofHash?: string;
    metadata?: Record<string, unknown>;
  }>();

  const [created] = await withRls(c, (tx) =>
    tx
      .insert(verifications)
      .values({
        userId,
        type: body.type,
        proofHash: body.proofHash,
        metadata: body.metadata ?? {},
        expiresAt:
          body.type === "selfie_liveness"
            ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
            : undefined,
      })
      .returning(),
  );

  return c.json({ data: created }, 201);
});

// GET /verification/badges?userId=xxx
app.get("/badges", async (c) => {
  const targetUserId = c.req.query("userId");
  if (!targetUserId)
    return c.json({ error: "userId query param required" }, 400);

  const result = await withRls(c, (tx) =>
    tx.execute(sql`
    SELECT type, status, verified_at
    FROM verifications
    WHERE user_id = ${targetUserId}
      AND status = 'verified'
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY verified_at DESC
  `),
  );

  return c.json({ data: result });
});

// ════════════════════════════════════════════════════════════════════════
// Analyzer
// ════════════════════════════════════════════════════════════════════════

// POST /verification/analyze
//
// REMOVED. This endpoint never called an LLM. It measured latency between two
// adjacent Date.now() calls (always ~0ms) and inserted a row with
// predictedStyle: null, empty openers, empty suggestions, and a hardcoded
// modelVersion of "gemini-2.5-flash" that was a lie about provenance. Any
// mobile client reaching for this very plausible name got a silent, empty 201
// with no error and no signal anything was wrong.
//
// The real implementation is POST /api/mobile/llm/analyze-profile
// (server/hono/routes/llm.ts), which actually calls callAnalyzeProfile().
// This stub now redirects rather than fabricating a success.
app.post("/analyze", (c) =>
  c.json(
    {
      error: "Moved",
      message:
        "Use POST /api/mobile/llm/analyze-profile. This endpoint never performed analysis.",
    },
    410,
  ),
);

// GET /verification/analyzer-sessions?limit=10
app.get("/analyzer-sessions", async (c) => {
  const userId = c.var.userId;
  const limit = Math.min(Number(c.req.query("limit") ?? 10), 50);

  const rows = await withRls(c, (tx) =>
    tx
      .select()
      .from(analyzerSessions)
      .where(eq(analyzerSessions.userId, userId))
      .orderBy(desc(analyzerSessions.createdAt))
      .limit(limit),
  );

  return c.json({ data: rows });
});

// GET /verification/analyzer-sessions/:id
app.get("/analyzer-sessions/:id", async (c) => {
  const userId = c.var.userId;
  const id = c.req.param("id");

  const [session] = await withRls(c, (tx) =>
    tx
      .select()
      .from(analyzerSessions)
      .where(
        and(eq(analyzerSessions.id, id), eq(analyzerSessions.userId, userId)),
      )
      .limit(1),
  );

  return c.json({ data: session ?? null });
});

export default app;
