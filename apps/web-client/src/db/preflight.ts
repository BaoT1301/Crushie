import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Database preflight checks.
 *
 * These answer questions that cannot be resolved by reading the repo, because
 * they depend on how the database was actually provisioned. Run once against a
 * real DATABASE_URL:
 *
 *   npx tsx src/db/preflight.ts
 *
 * The important one is BYPASSRLS. Supabase's default `postgres` role has it,
 * and if that is the role in DATABASE_URL then every RLS policy in
 * supabase/migrations is inert, including the request.jwt.claims plumbing in
 * db/secure-client.ts. Everything would appear to work while enforcing nothing,
 * which is the worst possible failure mode: silent.
 */

type Check = { name: string; ok: boolean; detail: string };

/** Run one check in isolation so a permission error does not abort the rest. */
async function safe(
  name: string,
  fn: () => Promise<Check>,
): Promise<Check> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name,
      ok: false,
      detail: `Could not verify from this role: ${msg.split("\n")[0]}`,
    };
  }
}

async function run(): Promise<Check[]> {
  const checks: Check[] = [];

  // 1. Does the connection role bypass RLS?
  const roleRows = (await db.execute(sql`
    SELECT current_user AS role, rolbypassrls, rolsuper
    FROM pg_roles WHERE rolname = current_user
  `)) as unknown as Array<{
    role: string;
    rolbypassrls: boolean;
    rolsuper: boolean;
  }>;

  const role = roleRows[0];
  const bypasses = Boolean(role?.rolbypassrls || role?.rolsuper);
  checks.push({
    name: "connection role respects RLS",
    ok: !bypasses,
    detail: bypasses
      ? `Role "${role?.role}" has BYPASSRLS/SUPERUSER. Every RLS policy is inert and secure-client.ts is decorative. Provision a least-privilege role for DATABASE_URL.`
      : `Role "${role?.role}" is subject to RLS.`,
  });

  // 2. Is RLS actually enabled on the tables that hold user data?
  const rlsRows = (await db.execute(sql`
    SELECT relname, relrowsecurity
    FROM pg_class
    WHERE relname IN ('users','analyzer_sessions','vibe_profiles','connections',
                      'vibe_matches','mission_instances','direct_messages')
  `)) as unknown as Array<{ relname: string; relrowsecurity: boolean }>;

  const disabled = rlsRows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
  checks.push({
    name: "RLS enabled on user-data tables",
    ok: disabled.length === 0,
    detail: disabled.length
      ? `RLS is OFF for: ${disabled.join(", ")}. The legacy scripts in src/legacy may have been applied.`
      : `RLS on for all ${rlsRows.length} checked tables.`,
  });

  // 3. Do the SQL functions the app calls actually exist? Several raw-SQL
  //    routes hard-crash with "function does not exist" without them, which is
  //    what happens if the drizzle-generated migration set was applied.
  const fnRows = (await db.execute(sql`
    SELECT proname FROM pg_proc
    WHERE proname IN ('user_id','find_similar_vibes','check_mutual_connections')
  `)) as unknown as Array<{ proname: string }>;

  const found = new Set(fnRows.map((r) => r.proname));
  const missing = ["user_id", "find_similar_vibes", "check_mutual_connections"]
    .filter((f) => !found.has(f));
  checks.push({
    name: "required SQL functions present",
    ok: missing.length === 0,
    detail: missing.length
      ? `Missing: ${missing.join(", ")}. The canonical migrations live in supabase/migrations at the repo root. Provision with: npx supabase db push`
      : "All present.",
  });

  // 4. pgvector, without which similarity matching cannot work.
  const extRows = (await db.execute(sql`
    SELECT extname FROM pg_extension WHERE extname = 'vector'
  `)) as unknown as Array<{ extname: string }>;
  checks.push({
    name: "pgvector installed",
    ok: extRows.length > 0,
    detail: extRows.length ? "vector extension present." : "vector extension MISSING.",
  });

  // 5. mission_templates seeded, or every mission creation fails its FK.
  const tplRows = (await db.execute(
    sql`SELECT count(*)::int AS n FROM mission_templates`,
  )) as unknown as Array<{ n: number }>;
  const n = tplRows[0]?.n ?? 0;
  checks.push({
    name: "mission_templates seeded",
    ok: n > 0,
    detail:
      n > 0
        ? `${n} templates.`
        : "Empty. mission_instances.template_id is NOT NULL REFERENCES, so every mission creation will fail a foreign key check.",
  });

  // 6. Storage bucket must not be public.
  //
  // Queried over the service-role REST API rather than SQL: the app role has no
  // grants on the storage schema (correct -- storage goes through
  // lib/supabase.ts with the service key), so a SQL read would fail on
  // permissions and tell us nothing about the bucket.
  checks.push(
    await safe("user-uploads bucket is private", async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        return {
          name: "user-uploads bucket is private",
          ok: false,
          detail: "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY unset.",
        };
      }

      const res = await fetch(`${url}/storage/v1/bucket/user-uploads`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      const body = (await res.json()) as { public?: boolean; message?: string };

      return {
        name: "user-uploads bucket is private",
        ok: body.public === false,
        detail:
          body.public === false
            ? "Private. Reads go through signed URLs."
            : `Bucket reports public=${String(body.public)}. ${body.message ?? ""}`.trim(),
      };
    }),
  );

  // 7. Migration 00014 applied?
  //
  // Every check above passed on a database that was still missing 00014, which
  // is the point of adding this one: the drift it fixes is invisible until a
  // user hits the feature. match_plan_cache.match_id is the marker column —
  // without it generateMatchPlan and getMatchPlan fail with `column "match_id"
  // does not exist`, and the two-person RLS policies that ship in the same file
  // are absent, so proposing a mission aborts with 42501.
  checks.push(
    await safe("migration 00014 applied", async () => {
      const cols = (await db.execute(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'match_plan_cache'
          AND column_name IN ('match_id', 'generated_at', 'expires_at')
      `)) as unknown as Array<{ column_name: string }>;

      const found = cols.map((c) => c.column_name);
      const missing = ["match_id", "generated_at", "expires_at"].filter(
        (c) => !found.includes(c),
      );

      return {
        name: "migration 00014 applied",
        ok: missing.length === 0,
        detail:
          missing.length === 0
            ? "match_plan_cache matches the Drizzle model."
            : `match_plan_cache is missing: ${missing.join(", ")}. Apply supabase/migrations/00014_schema_drift_and_partner_policies.sql (npx supabase db push).`,
      };
    }),
  );

  // 8. Every active vibe profile has an embedding.
  //
  // A profile with a NULL embedding is a valid row that is invisible to every
  // similarity query, so the failure is silent by construction — the user sees
  // "no compatible profiles found" and nothing is logged. That was the state of
  // this database until the embedding pipeline was added: the column existed
  // from 00002, every match query depended on it, and not one of the four
  // insert paths ever wrote it.
  //
  // embedAndStoreProfile is deliberately fail-soft so a transient OpenAI error
  // cannot discard a user's onboarding, which means this condition can recur.
  // Repair with: npm run db:backfill-embeddings --workspace=@starter/web
  checks.push(
    await safe("vibe profiles have embeddings", async () => {
      const rows = (await db.execute(sql`
        SELECT
          count(*) FILTER (WHERE embedding IS NULL) AS missing,
          count(*) AS total
        FROM vibe_profiles
        WHERE is_active = TRUE
      `)) as unknown as Array<{ missing: string; total: string }>;

      const missing = Number(rows[0]?.missing ?? 0);
      const total = Number(rows[0]?.total ?? 0);

      return {
        name: "vibe profiles have embeddings",
        ok: missing === 0,
        detail:
          missing === 0
            ? `All ${total} active profiles are embedded.`
            : `${missing} of ${total} active profiles have no embedding and cannot appear in matching. Run: npm run db:backfill-embeddings --workspace=@starter/web`,
      };
    }),
  );

  // 9. Does similarity search actually find everyone?
  //
  // The vector index is approximate. The original ivfflat index (lists = 100,
  // probes = 1) returned 2 of 9 profiles on this database — 22% recall, with no
  // error, so matching looked like it worked while discarding most candidates.
  //
  // This compares what find_similar_vibes returns at threshold 0 against the
  // true row count. They must agree. A gap means the index is dropping
  // candidates, which no amount of application code can compensate for.
  checks.push(
    await safe("similarity search has full recall", async () => {
      const totals = (await db.execute(sql`
        SELECT count(*)::int AS n
        FROM vibe_profiles WHERE is_active = TRUE AND embedding IS NOT NULL
      `)) as unknown as Array<{ n: number }>;

      const total = Number(totals[0]?.n ?? 0);

      if (total === 0) {
        return {
          name: "similarity search has full recall",
          ok: true,
          detail: "No embedded profiles yet; nothing to compare.",
        };
      }

      const found = (await db.execute(sql`
        SELECT count(*)::int AS n FROM find_similar_vibes(
          (SELECT embedding FROM vibe_profiles
             WHERE is_active = TRUE AND embedding IS NOT NULL LIMIT 1),
          1000, 0.0)
      `)) as unknown as Array<{ n: number }>;

      const returned = Number(found[0]?.n ?? 0);

      return {
        name: "similarity search has full recall",
        ok: returned >= total,
        detail:
          returned >= total
            ? `find_similar_vibes returns all ${total} embedded profiles.`
            : `find_similar_vibes returned ${returned} of ${total} profiles. The vector index is dropping candidates — apply supabase/migrations/00015_hnsw_vector_index.sql.`,
      };
    }),
  );

  return checks;
}

run()
  .then((checks) => {
    let failed = 0;
    for (const c of checks) {
      console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}\n      ${c.detail}`);
      if (!c.ok) failed++;
    }
    console.log(
      `\n${checks.length - failed}/${checks.length} passed.` +
        (failed ? " Fix the failures before going live." : " Good to go."),
    );
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => {
    console.error("Preflight could not run:", err?.message ?? err);
    process.exit(1);
  });
