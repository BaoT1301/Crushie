/**
 * Server startup hook.
 *
 * Next calls register() once when the server process boots, which is the only
 * place in this app that can schedule recurring work without an external
 * scheduler.
 */

export async function register() {
  // Guard the runtime. register() also runs for the edge runtime, where
  // node:timers and a Postgres socket do not exist, and importing the db client
  // there fails the build rather than the request.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startDatabaseKeepAlive } = await import("./server/keep-alive");
  startDatabaseKeepAlive();
}
