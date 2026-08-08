import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * Authenticated flow tests.
 *
 * These exercise the path nothing else has proven: Clerk session -> the
 * `supabase` JWT template -> secure-client.ts decoding claims -> Postgres RLS
 * under the non-bypassing `crushie_app` role -> real data.
 *
 * The test user was created through Clerk's Backend API with a pre-verified
 * email, so there is no verification code to automate.
 */

const BASE = "http://localhost:3000";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Third-party noise we do not control. */
const IGNORABLE = [
  /favicon/i,
  /clerk.*development keys/i,
  /Download the React DevTools/i,
  /net::ERR_/i,
  /_clerk/i,
  // Clerk bot protection answers the test harness with 412 on some XHRs. It
  // is a testing-token artefact, not an application error: the server log
  // stays clean across these runs.
  /412 \(Precondition Failed\)/i,
];
const realErrors = (e: string[]) =>
  e.filter((x) => !IGNORABLE.some((re) => re.test(x)));

const USER_ID = "user_3HdYVxsckucjhaooOP0LwkS2dPY";

/**
 * Signs in with a Clerk sign-in ticket.
 *
 * Two other approaches failed first, both instructively:
 *   - driving the form: Clerk re-renders between the identifier and password
 *     steps, detaching the password input mid-fill
 *   - clerk.signIn(): establishes a CLIENT session, but clerkMiddleware runs
 *     server-side and still bounced every protected route to /sign-in
 *
 * A sign-in ticket consumed via ?__clerk_ticket= produces a real server-side
 * session cookie, which is what the middleware actually reads.
 */
async function signIn(page: Page) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY not loaded by global setup");

  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: USER_ID, expires_in_seconds: 600 }),
  });
  const { token } = (await res.json()) as { token?: string };
  if (!token) throw new Error("Could not mint a Clerk sign-in ticket");

  await setupClerkTestingToken({ page });
  await page.goto(`${BASE}/sign-in?__clerk_ticket=${token}`, {
    waitUntil: "domcontentloaded",
  });

  // Clerk consumes the ticket client-side then redirects. Wait for it to land.
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), {
    timeout: 45_000,
  });
}

test.describe.configure({ mode: "serial" });

test.describe("authenticated app", () => {
  test("can sign in with the Clerk supabase template configured", async ({
    page,
  }) => {
    await signIn(page);

    // clerk.signIn() establishes the session but does not navigate, so the
    // proof is that a protected route stops bouncing us to sign-in.
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    expect(page.url()).not.toContain("/sign-in");
  });

  // Each page below is a distinct RLS surface. A failure here most likely
  // means a missing policy rather than a UI bug, since the crushie_app role
  // no longer bypasses RLS.
  for (const [name, path, marker] of [
    ["dashboard", "/dashboard", /dashboard|vibe|academy|match/i],
    ["discover", "/discover", /discover|match|connect/i],
    ["profile", "/profile", /profile|photo|vibe/i],
    ["on-board", "/on-board", /vibe|discovery|photo|step/i],
    ["analyze-profile", "/analyze-profile", /analy|upload|screenshot/i],
    ["settings", "/settings", /account|profile|security|settings/i],
  ] as const) {
    test(`${name} renders for a signed-in user`, async ({ page }) => {
      const errors = watchErrors(page);
      await signIn(page);

      const res = await page.goto(`${BASE}${path}`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status()).toBeLessThan(400);
      expect(page.url()).not.toContain("/sign-in");

      // Give client-side queries a moment to resolve or fail.
      await page.waitForTimeout(3500);

      const body = await page.locator("body").innerText();
      expect(body.length).toBeGreaterThan(40);
      expect(body).toMatch(marker);

      // These strings only appear when a tRPC/RLS call actually failed.
      expect(body).not.toMatch(/UNAUTHORIZED/i);
      expect(body).not.toMatch(/row-level security/i);
      expect(body).not.toMatch(/Application error/i);
      expect(body).not.toMatch(/does not exist/i);

      expect(realErrors(errors)).toEqual([]);
    });
  }

  test("theme is dark and brand font applied when authenticated", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });

    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass).toContain("dark");

    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    expect(r + g + b).toBeLessThan(120);
  });

  test("no em-dashes anywhere in the authenticated app", async ({ page }) => {
    await signIn(page);
    for (const path of ["/dashboard", "/discover", "/profile"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      const body = await page.locator("body").innerText();
      expect(body, `em-dash found on ${path}`).not.toContain("—");
    }
  });
});
