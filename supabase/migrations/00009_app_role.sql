-- ============================================================================
-- Migration: 00009_app_role.sql
--
-- Creates a least-privilege role for the application's DATABASE_URL.
--
-- WHY THIS EXISTS
--
-- Supabase's default `postgres` role has BYPASSRLS. While DATABASE_URL used it,
-- every RLS policy in this schema was evaluated exactly never: the elaborate
-- request.jwt.claims plumbing in db/secure-client.ts, and all ~40 policies in
-- 00001/00002/00004, were decorative. The app appeared to work and enforced
-- nothing.
--
-- `crushie_app` is NOBYPASSRLS, so policies actually apply.
--
-- The service_role key is unaffected and still bypasses RLS on purpose: it is
-- used server-side for storage operations in lib/supabase.ts.
--
-- SETTING THE PASSWORD
--
-- This file deliberately contains no password literal. An earlier revision did,
-- which meant the credential behind DATABASE_URL was sitting in a file staged
-- for commit. Migrations are source code: they get committed, mirrored, and
-- shared, so they are the wrong place for a secret.
--
-- The CREATE ROLE below is passwordless, which cannot be used to log in. Set
-- the password out of band, once, and never in a tracked file:
--
--   psql "$SUPERUSER_DATABASE_URL" \
--     -c "ALTER ROLE crushie_app PASSWORD '<generated-secret>';"
--
-- Generate the secret with `openssl rand -base64 32`, then put the matching
-- value in DATABASE_URL.
--
-- NOTE: the guard below means re-running this migration will NOT rotate an
-- existing password. Rotation is always the explicit ALTER ROLE above.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crushie_app') THEN
    CREATE ROLE crushie_app WITH LOGIN NOBYPASSRLS;
  END IF;
END $$;

-- Only NOBYPASSRLS is re-asserted here. Touching NOSUPERUSER/NOCREATEDB
-- requires the SUPERUSER attribute, which Supabase does not grant to postgres,
-- and CREATE ROLE above already omits them.
ALTER ROLE crushie_app NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO crushie_app;

-- Data access. No DDL: the app never alters its own schema at runtime.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO crushie_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crushie_app;

-- public.user_id() plus the similarity/connection helpers the raw-SQL routes
-- call. Without EXECUTE, every RLS policy errors instead of evaluating.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO crushie_app;

-- Anything created later inherits the same grants, so a new table does not
-- silently become unreachable to the app.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crushie_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO crushie_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO crushie_app;

-- pgvector operators live in extensions on Supabase.
GRANT USAGE ON SCHEMA extensions TO crushie_app;

-- ============================================================================
-- After applying, point DATABASE_URL at this role:
--
--   postgresql://crushie_app.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
--
-- Then re-run `npm run db:preflight`. The "connection role respects RLS" check
-- should flip to PASS.
-- ============================================================================
