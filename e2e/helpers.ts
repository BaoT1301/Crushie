import { type Page } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * Shared test harness.
 *
 * Extracted so `authenticated.spec.ts` and `interactive.spec.ts` sign in the
 * same way. The sign-in path is the fiddliest part of this suite and duplicating
 * it invites the two copies to drift.
 */

/**
 * Where the suite points.
 *
 * Overridable so a run can target a second server on another port — useful when
 * something else is already holding 3000, and for pointing the suite at a
 * preview deployment.
 */
export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * The Clerk user the authenticated suite signs in as.
 *
 * Overridable so anyone running this against their own Clerk instance does not
 * have to edit the file. Sign-in uses a server-minted ticket rather than a
 * password, so no credential belongs in this repo — an earlier revision carried
 * an unused email/password pair, which is exactly the kind of thing that ends up
 * in a public repo by accident.
 */
export const TEST_USER_ID =
  process.env.E2E_CLERK_USER_ID ?? "user_3HdYVxsckucjhaooOP0LwkS2dPY";

/**
 * Third-party noise we do not control and cannot fix.
 *
 * Keep this list tight. Every pattern added here is a class of real bug the
 * suite can no longer see.
 */
export const IGNORABLE_CONSOLE = [
  /favicon/i,
  /clerk.*development keys/i,
  /Download the React DevTools/i,
  /net::ERR_/i,
  /_clerk/i,
  // Clerk's bot protection answers the testing token with 412 on some XHRs.
  // A harness artefact: the server log stays clean across these runs.
  /412 \(Precondition Failed\)/i,
];

/**
 * Sign in with a Clerk sign-in ticket.
 *
 * Two other approaches failed first, both instructively:
 *   - driving the form: Clerk re-renders between the identifier and password
 *     steps, detaching the password input mid-fill
 *   - clerk.signIn(): establishes a CLIENT session, but clerkMiddleware runs
 *     server-side and still bounced every protected route to /sign-in
 *
 * A ticket consumed via ?__clerk_ticket= produces a real server-side session
 * cookie, which is what the middleware actually reads.
 */
export async function signIn(page: Page) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY not loaded by global setup");

  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: TEST_USER_ID, expires_in_seconds: 600 }),
  });

  const { token } = (await res.json()) as { token?: string };
  if (!token) throw new Error("Could not mint a Clerk sign-in ticket");

  await setupClerkTestingToken({ page });
  await page.goto(`${BASE}/sign-in?__clerk_ticket=${token}`, {
    waitUntil: "domcontentloaded",
  });

  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), {
    timeout: 45_000,
  });
}
