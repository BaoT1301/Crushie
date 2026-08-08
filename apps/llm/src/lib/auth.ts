/**
 * Service Token Auth Middleware
 *
 * Validates the X-Service-Token header on incoming requests. The web client
 * sends this to authenticate inter-service calls.
 */

import { Request, Response, NextFunction } from "express";

/**
 * Creates middleware that validates the X-Service-Token header.
 *
 * Previously this failed OPEN: if LLM_SERVICE_TOKEN was unset it called next()
 * and waved every request through. That is a reasonable local-dev convenience
 * and a serious production hazard, because forgetting one env var silently
 * turns the service into an open proxy on a paid AI key with no signal that
 * anything is wrong.
 *
 * It now fails CLOSED whenever NODE_ENV is not "development". Missing config is
 * treated as a misconfiguration to be fixed, not a default to be tolerated.
 */
export function requireServiceToken() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const expectedToken = process.env.LLM_SERVICE_TOKEN;
    const isDev = process.env.NODE_ENV === "development";

    if (!expectedToken) {
      if (isDev) {
        next();
        return;
      }

      console.error(
        "LLM_SERVICE_TOKEN is not set. Refusing request: the service will not run unauthenticated outside development.",
      );
      res.status(503).json({
        error: "Service unavailable",
        message: "Service authentication is not configured",
      });
      return;
    }

    const providedToken = req.headers["x-service-token"];

    if (!providedToken || providedToken !== expectedToken) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or missing X-Service-Token header",
      });
      return;
    }

    next();
  };
}
