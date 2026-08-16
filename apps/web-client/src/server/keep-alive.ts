import { sql } from "drizzle-orm";
import { db } from "@/db";
import { logger } from "@/lib/logger";

/**
 * Keeps the Supabase project from being paused for inactivity.
 *
 * THE PROBLEM
 *
 * Supabase pauses free projects after seven consecutive days of low activity.
 * Restoring one is manual and takes minutes, so the failure mode for a
 * portfolio project is the worst possible: it works every time you check it,
 * and is down the one time someone else opens the link.
 *
 * WHY A REAL QUERY
 *
 * Web traffic alone does not count. The landing page, the sign-in screen and
 * anything statically rendered never touch Postgres, so a project can serve
 * requests all week and still look idle to Supabase. Only a database query
 * resets the clock, which is why this runs a real read rather than pinging an
 * HTTP route.
 *
 * The read targets mission_templates: it is small, seeded by 00007, and has a
 * permissive SELECT policy, so it works under RLS with no JWT claims set. A
 * bare `SELECT 1` would also keep the connection busy but proves less — this
 * confirms the role can still reach application data.
 *
 * WHY IN PROCESS
 *
 * The alternatives are worse here. A GitHub Actions schedule is free but gets
 * disabled automatically after 60 days without repo activity, which is exactly
 * the dormancy this exists to survive. A dedicated cron service costs money to
 * run a query that takes milliseconds. This server is already running
 * continuously, so the cheapest correct answer is to let it do it.
 *
 * If the app is ever moved to a serverless host, this stops working silently:
 * there is no long-lived process to hold the timer. Schedule
 * /api/cron/keep-alive externally instead, which exists for that case.
 */

/** Comfortably inside the seven day window, without being chatty. */
const INTERVAL_MS = 24 * 60 * 60 * 1000;

let started = false;

export async function pingDatabase(): Promise<void> {
  await db.execute(sql`SELECT count(*) FROM mission_templates`);
}

export function startDatabaseKeepAlive(): void {
  // Next can call register() more than once in development as it recompiles,
  // and a duplicated timer would quietly double the query rate for the life of
  // the process.
  if (started) return;
  started = true;

  // Development restarts constantly and is never idle for a week, so the timer
  // would only add noise to the console and load to the pooler.
  if (process.env.NODE_ENV !== "production") return;

  const tick = async () => {
    try {
      await pingDatabase();
      logger.info("Database keep-alive ping succeeded");
    } catch (error) {
      // Logged rather than thrown. A failed ping means one missed heartbeat out
      // of seven days' worth, and an unhandled rejection here would take down a
      // server that is otherwise serving traffic perfectly well.
      logger.error("Database keep-alive ping failed", error);
    }
  };

  // One immediately, so a restart loop cannot leave the database untouched for
  // a week while each new process waits a full interval before its first tick.
  void tick();

  const timer = setInterval(tick, INTERVAL_MS);

  // Do not hold the event loop open on this alone. The HTTP server is what
  // should decide when the process may exit.
  timer.unref();

  logger.info("Database keep-alive scheduled", {
    intervalHours: INTERVAL_MS / 3_600_000,
  });
}
