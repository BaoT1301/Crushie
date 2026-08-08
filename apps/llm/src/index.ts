import "dotenv/config";
import type { Server } from "node:http";
import app from "./app.js";
import { initRedis, closeRedis } from "./lib/redis.js";
import { logger } from "./lib/logger.js";

const PORT = process.env.PORT || 3001;

/**
 * How long to let in-flight requests finish before forcing exit.
 *
 * Requests here are OpenAI calls with a 60s client timeout, but a deploy should
 * not stall for a full minute on one slow completion. 15s drains the common
 * case; anything still running past that is abandoned deliberately rather than
 * hanging the rollout.
 */
const SHUTDOWN_GRACE_MS = 15_000;

let server: Server | undefined;

async function main() {
  initRedis();

  server = app.listen(PORT, () => {
    console.log(`🚀 LLM prompt service running on http://localhost:${PORT}`);
    console.log(
      `📋 Templates: GET http://localhost:${PORT}/api/prompt/templates`,
    );
    console.log(`🩺 Health:    GET http://localhost:${PORT}/api/health`);
  });

  // listen() reports failures like EADDRINUSE as an event, not as a thrown
  // error, so a try/catch around main() could never have caught them. Without
  // this the process stayed alive having bound nothing.
  server.on("error", (error) => {
    logger.error("Failed to start server", error);
    process.exit(1);
  });
}

/**
 * Drain rather than drop.
 *
 * This previously called process.exit(0) immediately, which severed every
 * in-flight request. Because those are paid vision calls, each rolling deploy
 * threw away completions that had already been billed and returned a 502 to
 * whoever was waiting. server.close() stops accepting new connections and lets
 * the existing ones finish first.
 */
function shutdown(signal: string) {
  console.log(`🛑 ${signal} received — draining connections`);

  const force = setTimeout(() => {
    console.warn(
      `⚠️  Still busy after ${SHUTDOWN_GRACE_MS}ms — exiting anyway`,
    );
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);

  // Do not keep the event loop alive purely for the force-quit timer.
  force.unref();

  const finish = async () => {
    await closeRedis();
    clearTimeout(force);
    process.exit(0);
  };

  if (server) {
    server.close(() => void finish());
  } else {
    void finish();
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

/**
 * Backstop only. express-async-errors (see app.ts) routes handler rejections to
 * the error middleware, so this should not fire for request handling. It exists
 * because Node 22 terminates on an unhandled rejection by default, and a
 * background rejection — a detached cache write, say — should be logged rather
 * than allowed to kill a server that is otherwise healthy.
 */
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason);
});

main();
