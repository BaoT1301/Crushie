-- ============================================================================
-- Migration: 00008_missing_insert_policies.sql
--
-- Eight tables had RLS enabled with SELECT/UPDATE policies but NO INSERT
-- policy. Postgres denies by default, so with RLS actually enforced every
-- insert into these fails with "new row violates row-level security policy".
--
-- This went unnoticed because DATABASE_URL used the `postgres` role, which has
-- BYPASSRLS: nothing was ever evaluated. The moment a least-privilege role is
-- used (see 00009), signup itself breaks, because authedProcedure upserts into
-- `users` on every authenticated call.
--
-- Tables fixed: users, vibe_matches, mission_instances, vibe_points_ledger,
-- match_plan_cache, academy_levels, academy_rewards, mission_templates.
-- ============================================================================


-- ── users ───────────────────────────────────────────────────────────────────
-- server/init.ts upserts the caller's row on every authenticated request. The
-- id comes from Clerk server-side, so it is trusted, but the policy still has
-- to permit the row.
CREATE POLICY "Users can insert own row"
  ON users FOR INSERT
  WITH CHECK (id = public.user_id());


-- ── vibe_matches ────────────────────────────────────────────────────────────
-- A match row may only be created by one of its two participants.
CREATE POLICY "Users can create matches they are part of"
  ON vibe_matches FOR INSERT
  WITH CHECK (
    user_a_id = public.user_id() OR user_b_id = public.user_id()
  );


-- ── mission_instances ───────────────────────────────────────────────────────
-- Scoped through the owning match rather than granted broadly, so a user
-- cannot attach a mission to two other people's match.
CREATE POLICY "Users can create missions for their matches"
  ON mission_instances FOR INSERT
  WITH CHECK (
    match_id IN (
      SELECT id FROM vibe_matches
      WHERE user_a_id = public.user_id() OR user_b_id = public.user_id()
    )
  );


-- ── vibe_points_ledger ──────────────────────────────────────────────────────
-- Append-only points log. Users may only write entries about themselves.
CREATE POLICY "Users can insert own points entries"
  ON vibe_points_ledger FOR INSERT
  WITH CHECK (user_id = public.user_id());


-- ── match_plan_cache ────────────────────────────────────────────────────────
-- Cache rows are written on behalf of a mission the caller participates in.
-- mission_instance_id is nullable, so a bare cache entry is permitted too.
CREATE POLICY "Users can cache plans for their missions"
  ON match_plan_cache FOR INSERT
  WITH CHECK (
    mission_instance_id IS NULL
    OR mission_instance_id IN (
      SELECT mi.id FROM mission_instances mi
      JOIN vibe_matches vm ON vm.id = mi.match_id
      WHERE vm.user_a_id = public.user_id() OR vm.user_b_id = public.user_id()
    )
  );


-- ── Reference/catalogue tables ──────────────────────────────────────────────
-- academy_levels, academy_rewards and mission_templates are seeded content, not
-- user data. They are readable by everyone and deliberately get NO insert
-- policy for normal users: writes happen through migrations or the service
-- role, which bypasses RLS by design.
--
-- Documented explicitly so the absence reads as a decision rather than the
-- oversight it was on the tables above.


-- ── Verification ────────────────────────────────────────────────────────────
-- After applying, this should return zero rows:
--
--   SELECT c.relname
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
--   LEFT JOIN pg_policies p
--     ON p.tablename = c.relname AND p.schemaname = 'public'
--   WHERE c.relkind = 'r' AND c.relrowsecurity
--     AND c.relname NOT IN ('academy_levels','academy_rewards','mission_templates')
--   GROUP BY c.relname
--   HAVING NOT bool_or(p.cmd IN ('INSERT','ALL'));
