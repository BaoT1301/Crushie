/**
 * Hono Mobile API — Main Application
 *
 * REST API layer for mobile clients (React Native / Expo / Flutter).
 * Mirrors tRPC procedures as standard HTTP endpoints.
 *
 * Base path: /api/mobile
 * Auth: Clerk JWT via Authorization: Bearer <token>
 *
 * Structure:
 *   /api/mobile/users/*
 *   /api/mobile/vibe-profiles/*
 *   /api/mobile/social/*
 *   /api/mobile/missions/*
 *   /api/mobile/verification/*
 *   /api/mobile/llm/*
 *   /api/mobile/examples/*
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
// Aliased: Hono's request-logging middleware and our structured logger are both
// called `logger`, and both are used in this file.
import { logger as honoRequestLogger } from "hono/logger";
import { HTTPException } from "hono/http-exception";

import { clerk, requireAuth, type AuthEnv } from "./middleware";
import usersRoutes from "./routes/users";
import vibeProfilesRoutes from "./routes/vibe-profiles";
import socialRoutes from "./routes/social";
import missionsRoutes from "./routes/missions";
import verificationRoutes from "./routes/verification";
import llmRoutes from "./routes/llm";
import examplesRoutes from "./routes/examples";
import uploadsRoutes from "./routes/uploads";
import { logger } from "@/lib/logger";

// ── App Factory ─────────────────────────────────────────────────────────

const app = new Hono<AuthEnv>().basePath("/api/mobile");

// ── Global Middleware ───────────────────────────────────────────────────

app.use("*", honoRequestLogger());

app.use(
  "*",
  cors({
    origin: "*", // Mobile apps — allow all origins
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

// Health check (no auth)
app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "mobile-api",
    timestamp: new Date().toISOString(),
  }),
);

// Auth middleware for all other routes
app.use("*", clerk);
app.use("*", requireAuth);

// ── Route Groups ────────────────────────────────────────────────────────

app.route("/users", usersRoutes);
app.route("/vibe-profiles", vibeProfilesRoutes);
app.route("/social", socialRoutes);
app.route("/missions", missionsRoutes);
app.route("/verification", verificationRoutes);
app.route("/llm", llmRoutes);
app.route("/uploads", uploadsRoutes);
app.route("/examples", examplesRoutes);

// ── Error Handler ───────────────────────────────────────────────────────

app.onError((err, c) => {
  logger.error("[mobile-api] unhandled error", err, {
    path: c.req.path,
    method: c.req.method,
  });

  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  // Internals only in development. This previously returned err.message to
  // every caller, which surfaces Postgres constraint and table names on any
  // unhandled DB error. The Express service already gated this the same way.
  return c.json(
    {
      error: "Internal server error",
      message:
        process.env.NODE_ENV === "development" && err instanceof Error
          ? err.message
          : undefined,
    },
    500,
  );
});

// ── 404 ─────────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: "Not found", path: c.req.path }, 404));

export { app };
export default app;
