import { test } from "@playwright/test";

const OUT = "test-results/shots";

test("capture landing sections", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Crushie" }).waitFor();
  await page.waitForTimeout(2500);

  // Freeze looping decoration so shots are comparable run to run.
  await page.addStyleTag({
    content: `.ambient-drift,.heart-rise,.animate-heartbeat{animation:none!important}`,
  });

  const sections = [
    ["01-hero", "section >> nth=0"],
    ["02-analyzer", "#analyzer"],
    ["03-howitworks", "#how-it-works"],
    ["04-features", "#features"],
    ["05-privacy", "#privacy"],
    ["06-footer", "footer"],
  ] as const;

  for (const [name, sel] of sections) {
    const el = page.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await el.screenshot({ path: `${OUT}/${name}.png` });
  }
});
