/**
 * Express App — LLM Prompt Service
 *
 * A focused API for structured AI interactions via optimized prompt templates.
 * No database — optional Redis caching layer only.
 */

/**
 * Must be imported before any route module.
 *
 * Express 4 does not forward a rejected promise from an async handler to the
 * error middleware below — it escapes as an unhandled rejection instead, and
 * Node 22 terminates the process on those by default. Every route file here
 * ends in `catch (error) { ...; throw error; }`, so a single corrupt Redis
 * entry or an OpenAI timeout took the whole container down rather than
 * returning a 500.
 *
 * This shim patches Router to await handlers and pass rejections to next().
 * It can be removed if this service ever moves to Express 5, which does it
 * natively.
 */
import "express-async-errors";

import express from "express";
import cors from "cors";
import { rateLimit } from "./lib/rate-limit.js";
import { requireServiceToken } from "./lib/auth.js";
import healthRouter from "./routes/health.js";
import promptRouter from "./routes/prompt.js";
import vibeProfileRouter from "./routes/vibe-profile.js";
import analyzerRouter from "./routes/analyzer.js";
import evaluateMatchRouter from "./routes/evaluate-match.js";
import verifyIdentityRouter from "./routes/verify-identity.js";
import realtimeCoachRouter from "./routes/realtime-coach.js";
import vibeMatchRouter from "./routes/vibe-match.js";
import embeddingsRouter from "./routes/embeddings.js";
import personaReplyRouter from "./routes/persona-reply.js";
import { logger } from "./lib/logger.js";

const app = express();

// Middleware — 10mb limit for base64 image payloads
app.use(express.json({ limit: "10mb" }));
app.use(
  cors({
    origin: process.env.CORS_ORIGINS?.split(",") || ["http://localhost:3000"],
    credentials: true,
  }),
);

// Request logging (dev)
if (process.env.NODE_ENV === "development") {
  app.use((req, _res, next) => {
    console.log(`→ ${req.method} ${req.path}`);
    next();
  });
}

// Routes
// Health stays unlimited so container probes are never throttled.
app.use("/api/health", healthRouter);

// Everything below costs money per call, so it is rate limited.
app.use("/api", rateLimit());

/**
 * Auth is applied to the whole /api surface, not per route.
 *
 * It used to be attached inside each router, which left six endpoints
 * unauthenticated because they were simply never given the middleware — the
 * three /mock handlers, /analyzer/styles, /vibe-profile/presets and
 * /prompt/templates. None of them call a model, so the exposure was prompt
 * taxonomy rather than spend, but the shape of the mistake is what matters:
 * with per-route auth, the default for a newly added route is "open", and the
 * omission is invisible at review time.
 *
 * Mounting it here inverts that default. Health is registered above this line
 * and stays public on purpose so container probes work.
 */
app.use("/api", requireServiceToken());

app.use("/api/prompt", promptRouter);
app.use("/api/vibe-profile", vibeProfileRouter);
app.use("/api/analyzer", analyzerRouter);
app.use("/api/evaluate-match", evaluateMatchRouter);
app.use("/api/verify-identity", verifyIdentityRouter);
app.use("/api/realtime-coach", realtimeCoachRouter);
app.use("/api/vibe-match", vibeMatchRouter);
app.use("/api/embeddings", embeddingsRouter);
app.use("/api/persona-reply", personaReplyRouter);

// Error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error("Unhandled error", err);
    res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  },
);

export default app;
