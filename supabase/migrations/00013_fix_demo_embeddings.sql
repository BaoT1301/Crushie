-- ============================================================================
-- Migration: 00013_fix_demo_embeddings.sql
--
-- Rebuilds the demo embeddings so cosine similarity lands in a realistic range.
--
-- THE PROBLEM
--
-- 00011 generated each vector as sin(i * seed). Different seeds produce
-- near-orthogonal vectors, so every pairwise cosine similarity came out at
-- 0.000. find_similar_vibes() is called with a threshold, so a real user would
-- have matched nothing and Discover would still show an empty state despite
-- eight profiles existing. Verified by querying the ranking directly.
--
-- THE FIX
--
-- Real embeddings of people using the same product are not orthogonal: they
-- share most of their direction and differ in the margins. So each vector is
-- now a large shared base plus a small per-persona perturbation, which yields
-- similarities around 0.8 to 0.95 with genuine ordering between them.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.demo_embedding(seed INT)
RETURNS vector(1536) AS $$
  SELECT ('[' || string_agg(
            round((
              -- Shared direction: what all these profiles have in common.
              sin(i * 0.021) * 0.85
              -- Persona offset: the part that actually differentiates them.
              + sin(i * (0.31 + seed * 0.07) + seed) * 0.28
            )::numeric, 6)::text, ','
            ORDER BY i) || ']')::vector(1536)
  FROM generate_series(1, 1536) AS i;
$$ LANGUAGE SQL IMMUTABLE;

-- Re-embed the seeded personas with the corrected function.
UPDATE vibe_profiles vp
SET embedding = public.demo_embedding(
  CASE vp.user_id
    WHEN 'demo_maya'   THEN 1 WHEN 'demo_theo'  THEN 2
    WHEN 'demo_priya'  THEN 3 WHEN 'demo_jonas' THEN 4
    WHEN 'demo_amara'  THEN 5 WHEN 'demo_sunho' THEN 6
    WHEN 'demo_lena'   THEN 7 ELSE 8
  END
)
WHERE vp.user_id LIKE 'demo_%';
