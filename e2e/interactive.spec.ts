import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { signIn, IGNORABLE_CONSOLE, BASE } from "./helpers";

/**
 * Interactive sweep.
 *
 * The other suites prove pages *render*. This one proves they *work*: it walks
 * every authenticated route, enumerates the interactive controls, and clicks
 * each one, asserting the app neither throws nor navigates somewhere broken.
 *
 * The bugs this class of test catches are the ones static review misses —
 * a button wired to a handler that throws, a link to a route that 404s, a
 * dialog that cannot be closed. Two of those shipped in this codebase already
 * (/profile/edit redirected to a path that did not exist; a Discover effect
 * re-fired an LLM mutation forever).
 *
 * WHAT IT DELIBERATELY DOES NOT CLICK
 *
 * Destructive and irreversible controls, and anything that spends money on a
 * model call. Those need their own targeted tests with fixtures, not a
 * broad sweep that would delete the test account or run up an OpenAI bill on
 * every CI run.
 */

/** Controls a blind sweep must not press. */
const SKIP_LABEL =
  /sign out|log ?out|delete|remove|revoke|disconnect|danger|reset|clear|analyz|generate|regenerate|send|invite|redeem|upgrade|pay|subscribe/i;

/** Routes that make up the authenticated product surface. */
const ROUTES = [
  "/dashboard",
  "/discover",
  "/profile",
  "/on-board",
  "/analyze-profile",
  "/settings",
  "/theme-editor",
];

function watchPage(page: Page) {
  const errors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("response", (res) => {
    // Same-origin server errors only. Third-party 4xx is not ours to fix.
    if (res.status() >= 500 && res.url().startsWith(BASE)) {
      failedRequests.push(`${res.status()} ${res.url()}`);
    }
  });

  return {
    realErrors: () =>
      errors.filter((e) => !IGNORABLE_CONSOLE.some((re) => re.test(e))),
    failedRequests: () => failedRequests,
  };
}

test.describe("interactive sweep", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const route of ROUTES) {
    test(`${route} — every safe control is clickable without error`, async ({
      page,
    }) => {
      const watcher = watchPage(page);

      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500); // let queries settle

      // Snapshot the controls up front. Clicking mutates the DOM, so a live
      // locator list would go stale mid-loop.
      const controls = await page
        .locator("button:visible, [role='tab']:visible")
        .all();

      const labels: string[] = [];
      for (const control of controls) {
        const name =
          (await control.getAttribute("aria-label")) ??
          (await control.innerText().catch(() => "")) ??
          "";
        labels.push(name.trim().replace(/\s+/g, " ").slice(0, 40));
      }

      let clicked = 0;

      for (let i = 0; i < controls.length; i++) {
        const label = labels[i];
        if (!label || SKIP_LABEL.test(label)) continue;

        const control = controls[i];
        if (!(await control.isVisible().catch(() => false))) continue;
        if (!(await control.isEnabled().catch(() => false))) continue;

        await control.click({ timeout: 4000, trial: false }).catch(() => {
          // A control that scrolled out or got replaced is not a failure; the
          // assertions below are about the app's health, not click delivery.
        });
        clicked++;

        await page.waitForTimeout(180);

        // Dismiss anything modal so the next click is not blocked.
        await page.keyboard.press("Escape").catch(() => {});
      }

      // The page must still be alive and on our origin.
      expect(page.url()).toContain("localhost:3000");
      await expect(page.locator("body")).toBeVisible();

      expect(
        watcher.failedRequests(),
        `5xx responses while interacting with ${route}`,
      ).toEqual([]);

      expect(
        watcher.realErrors(),
        `console errors while interacting with ${route} (clicked ${clicked} controls)`,
      ).toEqual([]);
    });
  }

  test("no link points at a route that 404s", async ({ page }) => {
    const seen = new Set<string>();
    const broken: string[] = [];

    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);

      const hrefs = await page.locator("a[href^='/']").evaluateAll((links) =>
        links.map((l) => (l as HTMLAnchorElement).getAttribute("href") ?? ""),
      );

      for (const href of hrefs) {
        const clean = href.split("#")[0];
        if (!clean || seen.has(clean)) continue;
        seen.add(clean);

        const res = await page.request.get(`${BASE}${clean}`, {
          maxRedirects: 5,
        });
        if (res.status() === 404) broken.push(`${route} -> ${clean}`);
      }
    }

    expect(broken, "internal links resolving to 404").toEqual([]);
  });
});
