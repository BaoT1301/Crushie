import { supabaseAdmin, USER_UPLOADS_BUCKET } from "@/lib/supabase";
import { logger } from "@/lib/logger";

/**
 * Scheduled data retention.
 *
 * Nothing deleted user data before this existed. Uploaded screenshots — which
 * are photographs of third parties who never used this product and never
 * consented to anything — accumulated in Supabase Storage forever, and expired
 * matches, missions and cached plans stayed in Postgres indefinitely.
 *
 * Runs as the service role, deliberately: retention has to act across every
 * user's data, which is exactly what RLS is designed to prevent. That is the
 * one legitimate reason to bypass it here.
 *
 * Every step is independent and failures are collected rather than thrown, so
 * one bad storage prefix cannot stop the database sweep (or vice versa).
 */

/** How long an uploaded screenshot survives. */
const UPLOAD_RETENTION_DAYS = Number(
  process.env.UPLOAD_RETENTION_DAYS ?? "30",
);

/** How long an analyzer result survives. Longer than the image it came from:
 *  the text output is the user's own history and carries no third-party face. */
const SESSION_RETENTION_DAYS = Number(
  process.env.SESSION_RETENTION_DAYS ?? "180",
);

export type RetentionReport = {
  analyzerSessionsDeleted: number;
  expiredMatchesDeleted: number;
  expiredMissionsDeleted: number;
  expiredPlanCacheDeleted: number;
  storageObjectsDeleted: number;
  errors: string[];
  durationMs: number;
};

/** Objects under `{userId}/analyzer/` older than the cutoff, across all users. */
async function purgeExpiredUploads(errors: string[]): Promise<number> {
  const cutoff = Date.now() - UPLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0;

  // Storage has no "list everything older than X", so walk user prefixes. The
  // bucket is laid out as {userId}/{kind}/{file}, which makes the top level a
  // list of user ids.
  //
  // Paginated rather than a single list({ limit: 1000 }). Supabase caps a list
  // response, so a flat call silently stops at the cap — and the users it
  // stopped before would simply never have their uploads deleted, with the job
  // still reporting success. Retention that quietly covers the first N users is
  // worse than none, because it looks like it works.
  const userDirs: Array<{ name: string; metadata: unknown }> = [];
  const PAGE = 1000;

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin.storage
      .from(USER_UPLOADS_BUCKET)
      .list("", { limit: PAGE, offset });

    if (error) {
      errors.push(`storage list (root, offset ${offset}): ${error.message}`);
      break;
    }

    if (!data?.length) break;
    userDirs.push(...data);
    if (data.length < PAGE) break;
  }

  for (const dir of userDirs) {
    // Files at the root have metadata; directories do not.
    if (dir.metadata) continue;

    const prefix = `${dir.name}/analyzer`;
    const { data: files, error } = await supabaseAdmin.storage
      .from(USER_UPLOADS_BUCKET)
      .list(prefix, { limit: 1000 });

    if (error) {
      errors.push(`storage list (${prefix}): ${error.message}`);
      continue;
    }

    const stale = (files ?? [])
      .filter((f) => {
        const created = f.created_at ? Date.parse(f.created_at) : NaN;
        return Number.isFinite(created) && created < cutoff;
      })
      .map((f) => `${prefix}/${f.name}`);

    if (!stale.length) continue;

    const { error: removeError } = await supabaseAdmin.storage
      .from(USER_UPLOADS_BUCKET)
      .remove(stale);

    if (removeError) {
      errors.push(`storage remove (${prefix}): ${removeError.message}`);
      continue;
    }

    deleted += stale.length;
  }

  return deleted;
}

/**
 * Delete rows older than a cutoff, returning how many went.
 *
 * Goes through the service-role client rather than the app's Drizzle
 * connection, and that distinction is load-bearing. DATABASE_URL connects as
 * `crushie_app`, which is NOBYPASSRLS — and none of these tables has a DELETE
 * policy at all, so under RLS a DELETE matches nothing and reports no error.
 * The first version of this job used `db` and dutifully logged
 * "0 deleted, 0 errors" on every run while deleting nothing.
 *
 * `.select("id")` is what makes the count real: without it PostgREST returns no
 * rows and every sweep looks like a no-op again.
 */
async function deleteOlderThan(
  table: string,
  column: string,
  cutoffIso: string,
  errors: string[],
  extra?: (query: ReturnType<typeof buildDelete>) => ReturnType<typeof buildDelete>,
): Promise<number> {
  try {
    let query = buildDelete(table).lt(column, cutoffIso);
    if (extra) query = extra(query);

    const { data, error } = await query.select("id");

    if (error) {
      errors.push(`${table}: ${error.message}`);
      return 0;
    }
    return data?.length ?? 0;
  } catch (error) {
    errors.push(`${table}: ${(error as Error).message}`);
    return 0;
  }
}

function buildDelete(table: string) {
  return supabaseAdmin.from(table).delete();
}

export async function runRetention(): Promise<RetentionReport> {
  const startedAt = Date.now();
  const errors: string[] = [];
  const now = Date.now();

  const sessionCutoff = new Date(
    now - SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const nowIso = new Date(now).toISOString();

  let storageObjectsDeleted = 0;

  const analyzerSessionsDeleted = await deleteOlderThan(
    "analyzer_sessions",
    "created_at",
    sessionCutoff,
    errors,
  );

  // expires_at is nullable and NULL means "no expiry", which `.lt()` already
  // excludes — SQL comparisons against NULL are never true.
  const expiredMatchesDeleted = await deleteOlderThan(
    "vibe_matches",
    "expires_at",
    nowIso,
    errors,
  );

  const expiredMissionsDeleted = await deleteOlderThan(
    "mission_instances",
    "expires_at",
    nowIso,
    errors,
    // A completed mission is a record of something that happened; only
    // abandoned ones expire.
    (q) => q.neq("status", "completed"),
  );

  const expiredPlanCacheDeleted = await deleteOlderThan(
    "match_plan_cache",
    "expires_at",
    nowIso,
    errors,
  );

  try {
    storageObjectsDeleted = await purgeExpiredUploads(errors);
  } catch (error) {
    errors.push(`storage: ${(error as Error).message}`);
  }

  const report: RetentionReport = {
    analyzerSessionsDeleted,
    expiredMatchesDeleted,
    expiredMissionsDeleted,
    expiredPlanCacheDeleted,
    storageObjectsDeleted,
    errors,
    durationMs: Date.now() - startedAt,
  };

  if (errors.length) {
    logger.error("Retention run completed with errors", undefined, report);
  } else {
    logger.info("Retention run complete", report);
  }

  return report;
}
