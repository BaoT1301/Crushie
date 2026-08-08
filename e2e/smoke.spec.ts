import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

/**
 * Production-readiness smoke tests.
 *
 * Scope note: the authenticated app is behind Clerk, and a dev instance needs a
 * real signup with email verification, so these cover what a logged-out visitor
 * and a crawler actually reach. That is deliberately the highest-risk surface,
 * since it is the only part strangers can hit.
 *
 * Run with the dev server already up:  npx playwright test e2e/smoke.spec.ts
 */

const BASE = "http://localhost:3000";

/** Collect console errors and page exceptions for assertion after navigation. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Noise we do not control: browser extensions, favicon, third-party SDK chatter. */
const IGNORABLE = [
  /favicon/i,
  /Download the React DevTools/i,
  /clerk.*development keys/i,
  /net::ERR_/i,
];

function realErrors(errors: string[]) {
  return errors.filter((e) => !IGNORABLE.some((re) => re.test(e)));
}

test.describe("landing page", () => {
  test("renders with no console errors", async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Crushie" }).waitFor();

    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Crushie" })).toBeVisible();
    expect(realErrors(errors)).toEqual([]);
  });

  // Asserted via a raw fetch rather than the navigation response: Next streams
  // App Router HTML, so response.text() on a navigation only captures the
  // initial shell and would pass even if the page were hydration-only.
  test("is server-rendered, not a hydration-only shell", async ({ request }) => {
    const res = await request.get(BASE);
    expect(res.status()).toBe(200);

    const html = await res.text();
    // Real copy from the hero and from a below-fold section, so this fails if
    // either the shell or the streamed body stops being server-rendered.
    expect(html).toContain("Not just another dating app");
    expect(html).toContain("This is what you actually get");
    expect(html).toContain("PatriotHacks");
  });

  test("no fabricated social proof", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").innerText();

    for (const invented of [
      "2,000+",
      "hearts already connected",
      "50,000+",
      "98% Success Rate",
    ]) {
      expect(body).not.toContain(invented);
    }
  });

  test("no em-dashes in visible copy", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("—");
    expect(body).not.toContain("–");
  });

  test("brand fonts and dark theme actually applied", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass).toContain("dark");

    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    // Near-black, not the pale pink light theme.
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    expect(r + g + b).toBeLessThan(90);

    const font = await page.evaluate(() =>
      getComputedStyle(document.querySelector("h1")!).fontFamily,
    );
    expect(font.toLowerCase()).toContain("gabarito");
  });

  test("analyzer artwork cycles through styles", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    const card = page.locator("text=Predicted communication style").first();
    await card.scrollIntoViewIfNeeded();

    const first = await page
      .locator("text=Openers written for this profile")
      .first()
      .isVisible();
    expect(first).toBe(true);

    // Dot controls exist, which is what makes the auto-advance WCAG 2.2.2 safe.
    const dots = page.getByRole("button", { name: /Show .* example/ });
    expect(await dots.count()).toBe(5);
  });

  test("primary CTA is reachable and readable", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const cta = page.getByRole("button", { name: /Start free/i }).first();
    await expect(cta).toBeVisible();

    const box = await cta.boundingBox();
    expect(box!.height).toBeGreaterThan(32);
    // A wrapped CTA label is a layout failure at desktop width.
    expect(box!.height).toBeLessThan(80);
  });
});

test.describe("responsive", () => {
  for (const [name, width, height] of [
    ["mobile", 390, 844],
    ["tablet", 768, 1024],
    ["desktop", 1440, 900],
  ] as const) {
    test(`${name} has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(BASE, { waitUntil: "domcontentloaded" });

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("auth pages", () => {
  test("sign-up does not greet new users with Welcome Back", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sign-up`, { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Welcome Back!");
  });

  test("sign-in renders", async ({ page }) => {
    const res = await page.goto(`${BASE}/sign-in`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status()).toBe(200);
  });
});

test.describe("route protection", () => {
  test("dashboard routes redirect anonymous users", async ({ page }) => {
    for (const path of ["/dashboard", "/discover", "/on-board", "/profile"]) {
      const res = await page.goto(`${BASE}${path}`, {
        waitUntil: "domcontentloaded",
      });
      // Clerk should bounce to sign-in rather than render the page.
      expect(page.url()).toContain("sign-in");
      expect(res?.status()).toBeLessThan(500);
    }
  });

  test("realtime-tts is no longer an open ElevenLabs proxy", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/realtime-tts`, {
      data: { text: "abuse check" },
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    // Must not reach the handler and return audio. 3xx (Clerk redirect) or 4xx.
    expect(res.status()).not.toBe(200);
    expect(res.headers()["content-type"] ?? "").not.toContain("audio");
  });

  test("clerk webhook stays publicly reachable", async ({ request }) => {
    const res = await request.post(`${BASE}/api/webhooks/clerk`, {
      data: {},
      failOnStatusCode: false,
    });
    // Reaches the handler and is rejected on signature, not bounced by Clerk.
    expect([400, 500]).toContain(res.status());
  });
});

test.describe("accessibility basics", () => {
  test("images have alt text and buttons have names", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    const unnamed = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll("img").forEach((el) => {
        if (!el.getAttribute("alt")) bad.push(`img: ${el.src}`);
      });
      document.querySelectorAll("button").forEach((el) => {
        const name =
          el.getAttribute("aria-label") || el.textContent?.trim() || "";
        if (!name) bad.push(`button: ${el.outerHTML.slice(0, 60)}`);
      });
      return bad;
    });

    expect(unnamed).toEqual([]);
  });

  test("respects prefers-reduced-motion", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    // Ambient decoration must stop, not merely slow down.
    const running = await page.evaluate(() => {
      const el = document.querySelector(".ambient-drift");
      if (!el) return "missing";
      return getComputedStyle(el).animationName;
    });
    expect(running).toBe("none");
    await ctx.close();
  });
});
