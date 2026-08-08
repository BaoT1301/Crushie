-- ============================================================================
-- Migration: 00012_null_safe_user_id.sql
--
-- Makes public.user_id() null-safe.
--
-- THE BUG
--
-- The original body was:
--
--   SELECT COALESCE(
--     current_setting('request.jwt.claims', true)::json->>'sub',
--     current_setting('request.jwt.claims', true)::json->>'user_id'
--   );
--
-- When no claims are set, current_setting(..., true) returns an EMPTY STRING,
-- not NULL. Casting '' to json raises:
--
--   22P02 invalid input syntax for type json
--   DETAIL: The input string ended unexpectedly.
--
-- COALESCE never gets a chance to help, because the cast throws first.
--
-- So any query reaching an RLS policy from a context without claims -- a
-- migration, a maintenance script, a background job, psql -- errors out instead
-- of simply matching no rows. That turns "you have no access here" into "this
-- query is broken", which is a much harder failure to diagnose.
--
-- Found by running a seed-verification script against the demo profiles.
--
-- The fix returns NULL when claims are absent or unparseable, so policies
-- evaluate to false and the caller sees an empty result, which is what a
-- deny-by-default system should do.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.user_id()
RETURNS TEXT AS $$
DECLARE
  raw_claims TEXT;
  parsed     JSON;
BEGIN
  raw_claims := current_setting('request.jwt.claims', true);

  IF raw_claims IS NULL OR raw_claims = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    parsed := raw_claims::json;
  EXCEPTION WHEN others THEN
    -- Malformed claims are treated as no claims rather than an error.
    RETURN NULL;
  END;

  RETURN COALESCE(parsed->>'sub', parsed->>'user_id');
END;
$$ LANGUAGE plpgsql STABLE;
