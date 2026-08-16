import { NextResponse } from "next/server";
import { pingDatabase } from "@/server/keep-alive";
import { logger } from "@/lib/logger";

/**
 * Externally schedulable database keep-alive.
 *
 * Supabase pauses free projects after seven days of low activity, and web
 * traffic alone does not count: the landing page and anything statically
 * rendered never touch Postgres, so a project can serve requests all week and
 * still look idle. This runs a real query.
 *
 * WHEN TO USE THIS INSTEAD OF THE IN PROCESS TIMER
 *
 * server/keep-alive.ts already does this on a timer, which is the better answer
 * while the app runs as a long-lived process (Railway, a VPS, a container).
 * This route exists for the cases where that does not hold:
 *
 *   - a serverless host, where no process survives between requests
 *   - the app is scaled to zero or asleep, so nothing is running to tick
 *   - you want the heartbeat to be externally observable, so a silent failure
 *     shows up as a failed cron run rather than a log line nobody reads
 *
 * Running both is harmless. It is one small read a day either way.
 *
 * AUTH
 *
 * Read-only and cheap, but still authenticated: an unauthenticated endpoint
 * that opens a database connection is a free amplification primitive. Same
 * bearer secret as the retention route, and it fails closed for the same
 * reason.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/keep-alive
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    logger.error("CRON_SECRET is not configured; refusing to run keep-alive");
    return NextResponse.json(
      { error: "Keep-alive is not configured" },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await pingDatabase();
    logger.info("Database keep-alive ping succeeded (external)");
    return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
  } catch (error) {
    logger.error("Database keep-alive ping failed (external)", error);
    // 500 on purpose: a scheduler should be able to see this failed and alert,
    // which is most of the reason to prefer this route over the internal timer.
    return NextResponse.json(
      { ok: false, error: "Database unreachable" },
      { status: 500 },
    );
  }
}
