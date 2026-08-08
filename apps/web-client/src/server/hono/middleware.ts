/**
 * Hono Auth Middleware — Clerk JWT verification for mobile clients
 *
 * Mobile clients send `Authorization: Bearer <clerk_session_jwt>` to authenticate.
 * This middleware verifies the JWT and attaches the userId to Hono's context.
 */

import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";
import { HTTPException } from "hono/http-exception";
import { logger } from "@/lib/logger";

// ── Types ───────────────────────────────────────────────────────────────

export type AuthEnv = {
  Variables: {
    userId: string;
    /**
     * The verified Clerk session JWT, kept so route handlers can open an
     * RLS-scoped database connection.
     *
     * DATABASE_URL now connects as `crushie_app`, which is NOBYPASSRLS, so every
     * policy evaluates. Policies identify the caller through
     * `public.user_id()`, which reads `request.jwt.claims`. Something has to set
     * that per transaction, and getSecureDb() needs a token to do it.
     *
     * It cannot fall back to Clerk's cookie-session default here: mobile clients
     * authenticate with a Bearer token and send no cookie, so the default lookup
     * finds nothing. The token verified above is the right one to pass — the
     * `sub` claim that public.user_id() reads is the same value we set as
     * userId.
     */
    clerkToken: string;
  };
};

// ── Keys ────────────────────────────────────────────────────────────────

const secretKey = process.env.CLERK_SECRET_KEY!;

// ── Middleware ───────────────────────────────────────────────────────────

/**
 * Combined Clerk auth middleware — verifies JWT from Authorization header
 * and sets userId on the Hono context.
 *
 * Uses `@clerk/backend` `verifyToken` directly instead of `@hono/clerk-auth`
 * to have full control over the verification flow and error reporting.
 */
export const clerk = createMiddleware<AuthEnv>(async (c, next) => {
  // Skip auth for health check
  if (c.req.path === "/api/mobile/health") {
    await next();
    return;
  }

  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, {
      message: "Unauthorized: missing Authorization header",
    });
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyToken(token, { secretKey });

    if (!payload.sub) {
      logger.error("[auth] Token verified but no sub claim");
      throw new HTTPException(401, {
        message: "Unauthorized: token missing user identity",
      });
    }

    c.set("userId", payload.sub);
    c.set("clerkToken", token);
    await next();
  } catch (err: unknown) {
    // If it's already an HTTPException, re-throw
    if (err instanceof HTTPException) throw err;

    // Log the actual verification error for debugging
    logger.error("[auth] Token verification failed", err);
    throw new HTTPException(401, {
      message: "Unauthorized: invalid or expired token",
    });
  }
});

/**
 * requireAuth is now a no-op since `clerk` already sets userId.
 * Kept for backward compat so route files don't need changes.
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  if (!c.get("userId")) {
    throw new HTTPException(401, {
      message: "Unauthorized: valid Clerk session required",
    });
  }
  await next();
});
