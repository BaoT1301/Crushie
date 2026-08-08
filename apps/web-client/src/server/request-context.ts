import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Carries the calling user's id down to outbound service calls.
 *
 * THE PROBLEM THIS SOLVES
 *
 * The LLM service rate-limits on `req.socket.remoteAddress`. The browser never
 * talks to it directly — every call is proxied from this Next.js server — so
 * that address is our egress IP for 100% of traffic. The effect is one global
 * bucket: with the default RATE_LIMIT_MAX of 60/min the entire product is
 * capped at 60 AI calls per minute, and a single user opening the glasses
 * simulator (which streams webcam frames) exhausts it for everybody within
 * seconds.
 *
 * Fixing it needs a per-user identifier at the point where the outbound request
 * is built, which is several layers below the procedure that knows who the user
 * is. Threading it through would mean changing the signature of every exported
 * LLM helper and every call site.
 *
 * AsyncLocalStorage propagates through the await chain, so the id can be set
 * once where the user is authenticated and read where the header is written,
 * without touching anything in between.
 */
export type RequestContext = {
  userId: string;
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** The current user's id, or null outside an authenticated request. */
export function getRequestUserId(): string | null {
  return requestContext.getStore()?.userId ?? null;
}
