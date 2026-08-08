/**
 * In-process rate limiter.
 *
 * RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS have been passed into this container
 * by docker-compose.yml since it was written, but nothing ever read them, so
 * every AI endpoint has been unlimited. These routes each cost real money per
 * call (Gemini multimodal, Azure, ElevenLabs), which makes an unbounded loop
 * against them a billing incident rather than just a load problem.
 *
 * Deliberately dependency-free and in-memory. That is the right trade for a
 * single-container deployment; if this ever runs more than one replica the
 * counters are per-process and this should move to Redis, which is already a
 * dependency here.
 */

import { Request, Response, NextFunction } from "express";

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || "60", 10);

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Bound the map so a flood of distinct keys cannot grow it without limit.
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function clientKey(req: Request): string {
  // Prefer the end user over the network peer.
  //
  // Every request to this service is proxied by the Next.js server, so
  // remoteAddress is that server's egress address for all traffic — one global
  // bucket shared by the entire product. At the default 60/min, a single user
  // streaming webcam frames to the realtime coach 429s everyone else.
  //
  // X-End-User-Id is set by services/llm/client.ts. It is only trusted when the
  // caller also presented a valid X-Service-Token, which requireServiceToken()
  // has already checked by the time any route runs — but this middleware is
  // mounted BEFORE that check, so verify the token here too rather than letting
  // an unauthenticated caller pick its own bucket.
  const expectedToken = process.env.LLM_SERVICE_TOKEN;
  const presentedToken = req.headers["x-service-token"];
  const isTrustedCaller =
    Boolean(expectedToken) && presentedToken === expectedToken;

  if (isTrustedCaller) {
    const endUserId = req.headers["x-end-user-id"];
    if (typeof endUserId === "string" && endUserId.length > 0) {
      // Bound the key so a hostile value cannot bloat the map entry.
      return `user:${endUserId.slice(0, 128)}`;
    }
  }

  // X-Forwarded-For is client-supplied and this service is not behind a proxy
  // that strips it (docker-compose publishes 3001 directly). Trusting it let
  // any caller rotate the header per request and get a fresh bucket every
  // time, which defeated the limiter entirely.
  //
  // Only honour it when TRUST_PROXY is explicitly set, i.e. when an operator
  // has confirmed a real reverse proxy is in front.
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = req.headers["x-forwarded-for"];
    const fromHeader =
      typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : null;
    if (fromHeader) return `ip:${fromHeader}`;
  }

  return `ip:${req.socket.remoteAddress || "unknown"}`;
}

export function rateLimit() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();

    if (buckets.size > MAX_TRACKED_KEYS) {
      sweep(now);
      // sweep() only drops expired buckets, so a burst of live keys can still
      // exceed the cap. Hard-reset rather than grow without bound: worst case
      // a few callers get one extra window, which beats unbounded memory.
      if (buckets.size > MAX_TRACKED_KEYS) buckets.clear();
    }

    const key = clientKey(req);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      next();
      return;
    }

    bucket.count += 1;

    if (bucket.count > MAX_REQUESTS) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "Too many requests",
        message: `Rate limit of ${MAX_REQUESTS} requests per ${Math.round(
          WINDOW_MS / 1000,
        )}s exceeded`,
      });
      return;
    }

    next();
  };
}
