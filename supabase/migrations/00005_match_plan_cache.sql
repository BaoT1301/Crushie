-- ============================================================================
-- Migration: 00005_match_plan_cache.sql
--
-- Adds the one table that existed only in the Drizzle-generated migration set
-- (apps/web-client/supabase/migrations), bringing this directory to full
-- parity so it can be the single source of truth.
--
-- The bucket-privacy and RLS-re-enable fixes that were previously in this file
-- are gone on purpose: the database is being created fresh, so 00003 now
-- creates the bucket private from the start, and RLS was never disabled
-- because the legacy scripts in apps/web-client/src/legacy were never applied.
-- Fixing it at the source beats creating-then-patching.
-- ============================================================================

CREATE TABLE IF NOT EXISTS match_plan_cache (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_instance_id UUID,
  cache_key           TEXT NOT NULL,
  plan                JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The Drizzle version had neither a foreign key nor an index on this column,
-- so the reference was orphanable and every lookup was a sequential scan.
-- SET NULL rather than CASCADE: losing the mission should not silently delete
-- cached plan data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_match_plan_cache_mission_instance'
  ) THEN
    ALTER TABLE match_plan_cache
      ADD CONSTRAINT fk_match_plan_cache_mission_instance
      FOREIGN KEY (mission_instance_id)
      REFERENCES mission_instances(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_match_plan_cache_mission_instance
  ON match_plan_cache (mission_instance_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_plan_cache_key
  ON match_plan_cache (cache_key);

ALTER TABLE match_plan_cache ENABLE ROW LEVEL SECURITY;

-- Cache rows are written and read by the server on behalf of a match, so reads
-- are scoped through the owning mission instance rather than granted broadly.
CREATE POLICY "Users can read cached plans for their missions"
  ON match_plan_cache FOR SELECT
  USING (
    mission_instance_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM mission_instances mi
      JOIN vibe_matches vm ON vm.id = mi.match_id
      WHERE mi.id = match_plan_cache.mission_instance_id
        AND (vm.user_a_id = public.user_id() OR vm.user_b_id = public.user_id())
    )
  );
