import { NextResponse } from "next/server";
import { runRetention } from "@/services/retention";
import { logger } from "@/lib/logger";

/**
 * Scheduled retention sweep.
 *
 * Deletes uploaded screenshots past their retention window and clears expired
 * matches, missions and cached plans. See services/retention for what and why.
 *
 * AUTH
 *
 * This route deletes data across every user, so it must not be publicly
 * callable. It is exempt from Clerk's auth.protect() (a cron caller has no user
 * session) and authenticates with a bearer secret instead.
 *
 * It fails CLOSED: with no CRON_SECRET configured it returns 503 rather than
 * running unauthenticated. A destructive endpoint that defaults to open because
 * an env var is missing is exactly the shape of accident worth designing out.
 *
 * SCHEDULING
 *
 * Vercel Cron reads vercel.json and sends `Authorization: Bearer $CRON_SECRET`.
 * On Railway or anywhere else, any scheduler that can issue an authenticated
 * GET works:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/retention
 */

// Never cached, never prerendered: it mutates.
export const dynamic = "force-dynamic";

// Storage listing walks one prefix per user, so give it room beyond the default.
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    logger.error("CRON_SECRET is not configured; refusing to run retention");
    return NextResponse.json(
      { error: "Retention is not configured" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("authorization");

  if (provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await runRetention();

  // 207 when partially successful, so a scheduler's failure alerting is
  // meaningful rather than every run looking identical.
  return NextResponse.json(report, {
    status: report.errors.length ? 207 : 200,
  });
}
