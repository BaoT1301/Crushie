import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit tests for pure logic.
 *
 * The web app had no unit tests at all — the only coverage was Playwright,
 * which needs a running server, a database and a Clerk session, so it cannot
 * cheaply assert edge cases. This covers the functions where a silent wrong
 * answer is expensive: candidate merging (decides who a user sees) and log
 * redaction (decides what ends up in a retained log).
 *
 * Node environment on purpose. These are server-side modules; nothing here
 * touches the DOM, so jsdom would only add startup cost.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
