import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Routes that skip Clerk's auth.protect().
 *
 * This used to be a blanket "/api(.*)", which exempted every API route in the
 * app. That was load-bearing for three of the four, and a hole for the fourth:
 * /api/realtime-tts proxies straight to ElevenLabs and had no auth of its own,
 * so anyone could drain the TTS quota with a loop and no account.
 *
 * Each entry below is exempt for a specific reason, not by default:
 *
 *   /api/webhooks/*  Clerk calls this itself, unauthenticated by design. It is
 *                    verified by Svix signature in the handler instead.
 *   /api/mobile/*    The Hono app verifies its own Clerk JWT in
 *                    server/hono/middleware.ts and sets c.var.userId. Running
 *                    auth.protect() here too would break token-based mobile
 *                    clients that do not carry a session cookie.
 *   /api/trpc/*      Enforced per procedure by authedProcedure in
 *                    server/init.ts, which is what makes publicProcedure
 *                    possible at all.
 *
 *   /api/cron/*      Called by a scheduler, which has no user session to
 *                    protect. It authenticates with a bearer CRON_SECRET in the
 *                    handler and fails closed when that is unset.
 *
 * /api/realtime-tts is deliberately absent, so it is now protected.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/mobile(.*)",
  "/api/trpc(.*)",
  "/api/cron(.*)",
  "/trpc(.*)",
  // Crawler metadata. The matcher below excludes a list of static extensions
  // that does not include .txt or .xml, so without these two entries both files
  // were answered with a redirect to Clerk — a robots.txt no crawler can read
  // is worse than none, because it looks configured.
  "/robots.txt",
  "/sitemap.xml",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
