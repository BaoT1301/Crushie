-- ============================================================================
-- Migration: 00014_schema_drift_and_partner_policies.sql
--
-- Two unrelated classes of bug, both of which make core features fail at
-- runtime rather than at build time, which is why neither was caught earlier.
--
-- PART 1 — SCHEMA DRIFT
--
-- The Drizzle model and this migration set disagreed about match_plan_cache.
-- Drizzle declares match_id / generated_at / expires_at; the SQL had none of
-- them and instead required a NOT NULL cache_key that Drizzle never sends. So
-- every read errored with `column "match_id" does not exist` and every write
-- would have violated NOT NULL. generateMatchPlan and getMatchPlan were
-- completely dead against this schema.
--
-- This is the same failure 00010 fixed for analyzer_sessions.city. That fix was
-- applied to one table instead of being swept for, so the rest of the drift
-- survived.
--
-- PART 2 — RLS POLICIES FOR TWO-PERSON FLOWS
--
-- 00008 gave every user-data table an INSERT policy, but all of them are
-- self-scoped: `WITH CHECK (user_id = public.user_id())`. That is right for
-- personal rows and wrong for this product, which is built on pairs. Three
-- consequences, all live:
--
--   1. Proposing a mission inserts a progress row for BOTH participants. The
--      partner's row always fails the check, aborting the transaction. Mission
--      proposal and the whole match-plan flow were impossible.
--
--   2. Reading progress returns only the caller's own row, so the
--      `progress.every(p => p.checkedIn)` completion test in
--      services/missions/procedures/progress.ts was vacuously true. One person
--      could check in alone and complete a two-person mission, awarding points
--      to both. That is an integrity hole, not just a break.
--
--   3. Awarding points writes a ledger row for the partner, which fails the
--      same way as (1).
--
-- The fix is to scope these policies through match participation rather than
-- row ownership: you may touch a row if it belongs to a match you are in.
-- ============================================================================


-- ============================================================================
-- PART 1: match_plan_cache
-- ============================================================================

ALTER TABLE match_plan_cache
  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES vibe_matches(id) ON DELETE CASCADE;

ALTER TABLE match_plan_cache
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE match_plan_cache
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- cache_key predates match_id and is what match_id replaces. Dropping the
-- column would be the tidier end state, but it is NOT NULL with a UNIQUE index
-- and nothing in the application writes it, so relaxing the constraint is the
-- reversible move. Rows written from here on simply leave it NULL.
ALTER TABLE match_plan_cache
  ALTER COLUMN cache_key DROP NOT NULL;

-- Drizzle declares match_id as .unique(); onConflictDoUpdate({target: matchId})
-- needs a real unique constraint to resolve against, or the upsert errors.
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_plan_cache_match
  ON match_plan_cache (match_id);

CREATE INDEX IF NOT EXISTS idx_match_plan_cache_expires
  ON match_plan_cache (expires_at);

-- The 00008 INSERT policy keys on mission_instance_id, which is nullable and in
-- practice unset when a plan is cached directly against a match. Without a
-- match_id arm, every cache write from generateMatchPlan is rejected.
DROP POLICY IF EXISTS "Users can cache plans for their missions" ON match_plan_cache;

CREATE POLICY "Users can cache plans for their missions"
  ON match_plan_cache FOR INSERT
  WITH CHECK (
    (
      match_id IS NULL
      OR match_id IN (
        SELECT id FROM vibe_matches
        WHERE user_a_id = public.user_id() OR user_b_id = public.user_id()
      )
    )
    AND (
      mission_instance_id IS NULL
      OR mission_instance_id IN (
        SELECT mi.id FROM mission_instances mi
        JOIN vibe_matches vm ON vm.id = mi.match_id
        WHERE vm.user_a_id = public.user_id() OR vm.user_b_id = public.user_id()
      )
    )
  );

-- The upsert path needs UPDATE as well as INSERT; 00005 only granted SELECT.
DROP POLICY IF EXISTS "Users can update cached plans for their matches" ON match_plan_cache;

CREATE POLICY "Users can update cached plans for their matches"
  ON match_plan_cache FOR UPDATE
  USING (
    match_id IN (
      SELECT id FROM vibe_matches
      WHERE user_a_id = public.user_id() OR user_b_id = public.user_id()
    )
  );

-- 00005 named this "...for their missions" and keyed it on mission_instance_id
-- alone, so a plan cached against a match with no instance yet was unreadable.
DROP POLICY IF EXISTS "Users can read cached plans for their missions" ON match_plan_cache;
DROP POLICY IF EXISTS "Users can read cached plans for their matches" ON match_plan_cache;

CREATE POLICY "Users can read cached plans for their matches"
  ON match_plan_cache FOR SELECT
  USING (
    match_id IS NULL
    OR match_id IN (
      SELECT id FROM vibe_matches
      WHERE user_a_id = public.user_id() OR user_b_id = public.user_id()
    )
  );


-- ============================================================================
-- PART 2a: user_mission_progress — partner visibility and seeding
-- ============================================================================

-- Read: you may see the progress of anyone sharing a mission instance with you.
-- Without this the completion check above can only ever see one row.
DROP POLICY IF EXISTS "Users can read own mission progress" ON user_mission_progress;

CREATE POLICY "Users can read progress for their missions"
  ON user_mission_progress FOR SELECT
  USING (
    user_id = public.user_id()
    OR instance_id IN (
      SELECT mi.id FROM mission_instances mi
      JOIN vibe_matches vm ON vm.id = mi.match_id
      WHERE vm.user_a_id = public.user_id() OR vm.user_b_id = public.user_id()
    )
  );

-- Insert: proposing a mission seeds a row for both participants at once.
DROP POLICY IF EXISTS "Users can insert own mission progress" ON user_mission_progress;

CREATE POLICY "Participants can seed progress for their missions"
  ON user_mission_progress FOR INSERT
  WITH CHECK (
    instance_id IN (
      SELECT mi.id FROM mission_instances mi
      JOIN vibe_matches vm ON vm.id = mi.match_id
      WHERE vm.user_a_id = public.user_id() OR vm.user_b_id = public.user_id()
    )
  );

-- Update stays strictly self-scoped on purpose. Seeding a partner's row is
-- necessary bookkeeping; checking in on their behalf is not, and allowing it
-- would recreate the self-completion hole from the other direction.
DROP POLICY IF EXISTS "Users can update own mission progress" ON user_mission_progress;

CREATE POLICY "Users can update own mission progress"
  ON user_mission_progress FOR UPDATE
  USING (user_id = public.user_id());


-- ============================================================================
-- PART 2b: vibe_points_ledger — awarding a partner their share
-- ============================================================================

-- Completing a mission credits both participants. Scope the write through the
-- mission rather than the row owner, and keep the self-award arm for the solo
-- point events (onboarding, vouches) that also use this table.
DROP POLICY IF EXISTS "Users can insert own points entries" ON vibe_points_ledger;

CREATE POLICY "Users can insert points for themselves or their mission partner"
  ON vibe_points_ledger FOR INSERT
  WITH CHECK (
    user_id = public.user_id()
    OR user_id IN (
      SELECT CASE
               WHEN vm.user_a_id = public.user_id() THEN vm.user_b_id
               ELSE vm.user_a_id
             END
      FROM vibe_matches vm
      WHERE vm.user_a_id = public.user_id() OR vm.user_b_id = public.user_id()
    )
  );


-- ============================================================================
-- PART 2c: users — matched partners are not strangers
-- ============================================================================

-- The 00001 policy is `USING (id = public.user_id())`, so a user can read only
-- their own row. Every match card therefore rendered the partner as
-- "Anonymous" with no avatar, because the join returned nothing.
--
-- This widens reads to people you are actually matched with. It is not a
-- general directory: an unmatched user remains invisible.
DROP POLICY IF EXISTS "Users can read own data" ON users;

CREATE POLICY "Users can read own data or matched partners"
  ON users FOR SELECT
  USING (
    id = public.user_id()
    OR EXISTS (
      SELECT 1 FROM vibe_matches vm
      WHERE (vm.user_a_id = public.user_id() AND vm.user_b_id = users.id)
         OR (vm.user_b_id = public.user_id() AND vm.user_a_id = users.id)
    )
  );


-- ============================================================================
-- PART 2d: check_mutual_connections could never return a row
-- ============================================================================

-- Declared in 00002 as SQL STABLE with no SECURITY DEFINER, so it runs as the
-- invoker. Its second leg reads the *target* user's connections, which the
-- connections SELECT policy hides. The function was structurally incapable of
-- finding a mutual.
--
-- SECURITY DEFINER lets it see both sides. The explicit p_user_id guard keeps
-- that from becoming an enumeration primitive: you may only ask about pairs
-- where you are one half. search_path is pinned because a definer function
-- without one is a privilege-escalation vector.
--
-- DROP then CREATE, not CREATE OR REPLACE: the body is unchanged but it is
-- being converted from SQL to plpgsql to carry the guard, and Postgres refuses
-- to replace a function whose language or signature shape changes.
DROP FUNCTION IF EXISTS public.check_mutual_connections(TEXT, TEXT);

CREATE FUNCTION public.check_mutual_connections(
  p_user_id   TEXT,
  p_target_id TEXT
)
RETURNS TABLE (
  mutual_friend_id TEXT,
  connection_type  TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM public.user_id() THEN
    RAISE EXCEPTION 'check_mutual_connections: may only be called for yourself';
  END IF;

  -- Body is the 00002 query verbatim. Only the security context changed.
  RETURN QUERY
  SELECT
    c1.addressee_id AS mutual_friend_id,
    'mutual_connection'::TEXT AS connection_type
  FROM connections c1
  JOIN connections c2 ON c1.addressee_id = c2.requester_id
    OR c1.addressee_id = c2.addressee_id
  WHERE c1.requester_id = p_user_id
    AND c1.status = 'accepted'
    AND (c2.requester_id = p_target_id OR c2.addressee_id = p_target_id)
    AND c2.status = 'accepted'
    AND c1.addressee_id <> p_user_id
    AND c1.addressee_id <> p_target_id;
END;
$$;

-- The role must be re-granted after a DROP: grants do not survive it.
GRANT EXECUTE ON FUNCTION public.check_mutual_connections(TEXT, TEXT) TO crushie_app;


-- ============================================================================
-- PART 2e: the AI match-plan template
-- ============================================================================

-- getOrCreateAiTemplate() in services/social/procedures/generate-match-plan.ts
-- looks for a template with generated_by = 'ai-match-plan' and inserts one when
-- absent. Every row seeded by 00007 is generated_by = 'manual', so the insert
-- path was always taken — and mission_templates deliberately has no INSERT
-- policy (00008 documents that as a decision), so it always failed, after the
-- LLM call had already been paid for.
--
-- Seeding the row here means the lookup succeeds and the insert path is never
-- reached. The application code is changed to throw rather than insert, so this
-- row missing becomes a loud error instead of a silent 42501.
INSERT INTO mission_templates
  (title, description, mission_type, difficulty, location_query,
   weather_filter, base_points, duration_min, objectives, generated_by)
VALUES
  ('Valentine Mission',
   'AI-generated interaction mission for a matched pair',
   'mini_date', 'medium', 'local aesthetic places',
   '{}'::jsonb, 180, 90, '[]'::jsonb, 'ai-match-plan')
ON CONFLICT (title) DO NOTHING;
