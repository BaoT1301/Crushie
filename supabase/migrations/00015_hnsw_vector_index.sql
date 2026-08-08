-- ============================================================================
-- Migration: 00015_hnsw_vector_index.sql
--
-- Replaces the ivfflat index on vibe_profiles.embedding with HNSW.
--
-- THE BUG
--
-- 00002 created:
--   CREATE INDEX idx_vibe_profiles_embedding
--     ON vibe_profiles USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 100);
--
-- ivfflat is an APPROXIMATE index. It partitions vectors into `lists` clusters
-- and, at query time, scans only `ivfflat.probes` of them — which defaults to 1.
-- With 100 clusters and a small table, the rows scatter across a handful of
-- clusters and a single probe finds almost none of them.
--
-- Measured on this database with 9 active embedded profiles:
--
--   SELECT count(*) FROM find_similar_vibes(<embedding>, 50, 0.0);
--   -> 2
--
--   SELECT count(*) FROM vibe_profiles WHERE is_active AND embedding IS NOT NULL;
--   -> 9
--
-- 22% recall, with no error and no warning. Every similarity query silently
-- discarded most candidates, and the ones it kept were not even the nearest —
-- just whichever happened to land in the probed cluster. This is the worst
-- shape of failure: matching appeared to work and quietly returned the wrong
-- answer.
--
-- WHY HNSW
--
-- HNSW is also approximate, but its recall is high by default and does not
-- depend on a probes setting nobody remembers to raise. It is the right default
-- at both ends of the scale: correct on a nearly-empty table today, and still
-- fast when there are a million profiles.
--
-- The alternative — raising ivfflat.probes — is a per-session GUC, so every
-- caller would have to remember to set it, and forgetting reintroduces exactly
-- this bug. Building recall into the index instead of into every call site is
-- the more durable fix.
--
-- Cost: HNSW builds more slowly and uses more memory than ivfflat. At this
-- table's size that is irrelevant, and it stays acceptable well past the point
-- where this product would be a success.
-- ============================================================================

DROP INDEX IF EXISTS idx_vibe_profiles_embedding;

-- m = 16, ef_construction = 64 are pgvector's defaults and are appropriate
-- here; tune only with measurements, not by guessing.
CREATE INDEX IF NOT EXISTS idx_vibe_profiles_embedding
  ON vibe_profiles
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- Verify after applying — these two counts must now agree:
--
--   SELECT count(*) FROM vibe_profiles WHERE is_active AND embedding IS NOT NULL;
--   SELECT count(*) FROM find_similar_vibes(
--     (SELECT embedding FROM vibe_profiles WHERE is_active LIMIT 1), 50, 0.0);
--
-- `npm run db:preflight` checks this automatically.
-- ============================================================================
