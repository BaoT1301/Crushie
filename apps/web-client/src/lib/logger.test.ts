import { describe, it, expect, vi, afterEach } from "vitest";
import { logger, setErrorReporter } from "./logger";

/**
 * These assert the two properties that actually matter for a log line:
 * it must not leak a secret, and it must not be able to take down the request
 * that was already failing.
 */

function captureLog(fn: () => void): string[] {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...a) => {
    lines.push(a.map(String).join(" "));
  });
  const err = vi.spyOn(console, "error").mockImplementation((...a) => {
    lines.push(a.map(String).join(" "));
  });
  try {
    fn();
  } finally {
    log.mockRestore();
    err.mockRestore();
  }
  return lines;
}

afterEach(() => setErrorReporter(null));

describe("logger redaction", () => {
  it("redacts secret-ish keys instead of logging their values", () => {
    const lines = captureLog(() =>
      logger.info("sync", {
        userId: "user_123",
        token: "eyJhbGciOi.SECRET.sig",
        password: "hunter2",
        selfieBase64: "iVBORw0KGgo",
      }),
    );

    const out = lines.join("\n");
    expect(out).toContain("user_123");
    expect(out).not.toContain("SECRET");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("iVBORw0KGgo");
    expect(out).toContain("[redacted]");
  });

  it("redacts nested secrets, not just top-level keys", () => {
    const lines = captureLog(() =>
      logger.info("outbound", { request: { headers: { authorization: "Bearer abc123" } } }),
    );
    expect(lines.join("\n")).not.toContain("abc123");
  });

  it("truncates oversized values so a payload cannot become a log line", () => {
    const huge = "x".repeat(5000);
    const lines = captureLog(() => logger.info("upload", { frameNote: huge }));

    const out = lines.join("\n");
    expect(out.length).toBeLessThan(2000);
    expect(out).toContain("5000 chars");
  });
});

describe("error reporter seam", () => {
  it("hands the error to a registered reporter", () => {
    const seen: unknown[] = [];
    setErrorReporter((error) => seen.push(error));

    const boom = new Error("boom");
    captureLog(() => logger.error("failed", boom));

    expect(seen).toEqual([boom]);
  });

  it("survives a reporter that throws", () => {
    setErrorReporter(() => {
      throw new Error("reporter is down");
    });

    // The request was already failing; the reporter must not make it worse.
    expect(() =>
      captureLog(() => logger.error("failed", new Error("original"))),
    ).not.toThrow();
  });
});
