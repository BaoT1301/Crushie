-- ============================================================================
-- Launch step: remove seeded demo profiles
--
-- DELIBERATELY NOT IN supabase/migrations/.
--
-- Everything in that directory is applied by `supabase db push`, and the demo
-- profiles seeded by 00011/00013 are wanted right now — without them
-- find_similar_vibes() has nothing to compare against and Match Center renders
-- "No candidates yet" for every user. Putting this teardown in the migration
-- set would delete them on the next push, which is the opposite of the intent.
--
-- Run it by hand, once, as the final step before opening signups:
--
--   psql "$SUPERUSER_DATABASE_URL" -f supabase/launch/remove-demo-profiles.sql
--
-- Everything here is scoped to the `demo_` id prefix, so it cannot touch a real
-- account. It is safe to run more than once.
-- ============================================================================

BEGIN;

-- vibe_profiles, connections, vibe_matches, crush_list and the rest all
-- reference users(id) ON DELETE CASCADE, so this one statement is sufficient.
DELETE FROM users WHERE id LIKE 'demo\_%';

-- The pseudo-embedding generator exists only to seed the personas above, and
-- 00009 grants EXECUTE on all public functions to crushie_app, so leaving it in
-- place hands the application role a function it has no reason to call.
DROP FUNCTION IF EXISTS public.demo_embedding(INT);

COMMIT;

-- Verify: both should return 0.
--
--   SELECT count(*) FROM users WHERE id LIKE 'demo\_%';
--   SELECT count(*) FROM pg_proc WHERE proname = 'demo_embedding';
