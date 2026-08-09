-- ============================================================================
-- Migration: 00016_persona_display_names.sql
--
-- Drops the "Demo" surname from the seeded personas.
--
-- 00011 gave all eight a last name of 'Demo', and matches.ts builds a display
-- name as [first_name, last_name].join(" "). So every persona rendered as
-- "Maya Demo", "Theo Demo", and so on: the scaffolding was showing through into
-- the product.
--
-- Setting last_name to NULL rather than inventing surnames. The join above
-- filters falsy parts, so they render as "Maya" and "Theo", which is how people
-- present themselves on a dating app anyway.
--
-- WHAT IS DELIBERATELY NOT CHANGED
--
-- The `demo_` id prefix stays. It is not cosmetic — it is the mechanism:
--
--   isDemoUser()                     services/chat/persona-reply.ts
--   persona reply routing            chat.sendMessage / requestPersonaReply
--   isDemo flag for the UI           services/llm/procedures/merge-candidates.ts
--   the pre-launch cleanup script    supabase/launch/remove-demo-profiles.sql
--
-- Renaming the ids would silently turn the personas into ordinary accounts that
-- never answer and that the launch cleanup no longer finds. The prefix is
-- server-side only and never rendered.
--
-- The @demo.crushie.local emails also stay. That domain is reserved and
-- non-routable, which is the point: mail addressed to a persona cannot leave.
-- Emails are not displayed anywhere in the product.
-- ============================================================================

UPDATE users
SET last_name = NULL,
    updated_at = NOW()
WHERE id LIKE 'demo\_%'
  AND last_name = 'Demo';
