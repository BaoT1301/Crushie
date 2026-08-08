-- ============================================================================
-- Migration: 00010_analyzer_env_context.sql
--
-- Adds the environmental-context columns to analyzer_sessions.
--
-- These existed only in the Drizzle-generated migration set
-- (apps/web-client/supabase/migrations/0002_analyzer_env_context.sql), which is
-- not the set we provision from. The Drizzle SCHEMA
-- (services/verification/schema/index.ts:92-95) declares them, so every insert
-- the app builds includes these columns, and against the canonical set that
-- failed with:
--
--   column "city" of relation "analyzer_sessions" does not exist
--
-- Found by actually running the Crush Analyzer: the AI call succeeded and
-- returned real openers and date plans, then the write threw them away. That is
-- the concrete cost of the two migration trees having drifted, and the reason
-- the root set is now the single source of truth.
--
-- Privacy note carried over from the original: city name only, never raw
-- coordinates.
-- ============================================================================

ALTER TABLE analyzer_sessions
  ADD COLUMN IF NOT EXISTS city             TEXT,
  ADD COLUMN IF NOT EXISTS weather_context  JSONB,
  ADD COLUMN IF NOT EXISTS location_context JSONB,
  ADD COLUMN IF NOT EXISTS nearby_places    JSONB DEFAULT '[]'::jsonb;
