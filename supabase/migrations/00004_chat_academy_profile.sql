-- Migration 00004: Chat, Academy Rewards, and Profile Column Additions
-- Date: 2026-02-15

-- ============================================================
-- 1. Add missing profile columns to users and vibe_profiles
-- ============================================================

-- User gender enum (if not exists)
DO $$ BEGIN
  CREATE TYPE user_gender AS ENUM ('male', 'female', 'non-binary', 'prefer-not-to-say');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Vibe profile gender enum
DO $$ BEGIN
  CREATE TYPE gender_identity AS ENUM ('male', 'female', 'non-binary', 'prefer-not-to-say');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Interested-in enum
DO $$ BEGIN
  CREATE TYPE interested_in AS ENUM ('male', 'female', 'non-binary', 'everyone');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender user_gender;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

-- Add columns to vibe_profiles
ALTER TABLE vibe_profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE vibe_profiles ADD COLUMN IF NOT EXISTS gender gender_identity;
ALTER TABLE vibe_profiles ADD COLUMN IF NOT EXISTS interested_in interested_in;

-- ============================================================
-- 2. Direct Messages table for match-based chat
-- ============================================================

CREATE TABLE IF NOT EXISTS direct_messages (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id      UUID NOT NULL REFERENCES vibe_matches(id) ON DELETE CASCADE,
  sender_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_match_id ON direct_messages(match_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_created_at ON direct_messages(match_id, created_at DESC);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages in matches they belong to
CREATE POLICY "Users can read messages in their matches"
  ON direct_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vibe_matches
      WHERE vibe_matches.id = direct_messages.match_id
        AND (vibe_matches.user_a_id = public.user_id() OR vibe_matches.user_b_id = public.user_id())
    )
  );

-- Users can send messages in matches they belong to
CREATE POLICY "Users can send messages in their matches"
  ON direct_messages FOR INSERT
  WITH CHECK (
    sender_id = public.user_id()
    AND EXISTS (
      SELECT 1 FROM vibe_matches
      WHERE vibe_matches.id = direct_messages.match_id
        AND (vibe_matches.user_a_id = public.user_id() OR vibe_matches.user_b_id = public.user_id())
    )
  );

-- ============================================================
-- 3. Academy Levels (seed data for tier system)
-- ============================================================

CREATE TABLE IF NOT EXISTS academy_levels (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  min_points  INTEGER NOT NULL DEFAULT 0,
  badge_icon  TEXT NOT NULL DEFAULT '🏅',
  perks       JSONB DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE academy_levels ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read levels
CREATE POLICY "Authenticated users can read academy levels"
  ON academy_levels FOR SELECT
  USING (true);

-- Seed academy levels
INSERT INTO academy_levels (name, min_points, badge_icon, perks) VALUES
  ('Bronze',   0,    '🥉', '["Basic profile badge"]'::jsonb),
  ('Silver',   500,  '🥈', '["Silver badge", "Priority matching"]'::jsonb),
  ('Gold',     1500, '🥇', '["Gold badge", "Priority matching", "Extended mission time"]'::jsonb),
  ('Platinum', 5000, '💎', '["Platinum badge", "Priority matching", "Extended mission time", "Exclusive events"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 4. Academy Rewards (redeemable items)
-- ============================================================

CREATE TABLE IF NOT EXISTS academy_rewards (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  cost        INTEGER NOT NULL,
  category    TEXT NOT NULL DEFAULT 'badge',
  icon        TEXT NOT NULL DEFAULT '🎁',
  is_active   BOOLEAN DEFAULT TRUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE academy_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active rewards"
  ON academy_rewards FOR SELECT
  USING (is_active = TRUE);

-- Seed some rewards
INSERT INTO academy_rewards (title, description, cost, category, icon) VALUES
  ('Conversation Starter Badge', 'Show others you''re great at breaking the ice', 200, 'badge', '💬'),
  ('Super Like Token', 'Send a highlighted connection request that stands out', 300, 'powerup', '⭐'),
  ('Date Planner Pro', 'Unlock AI-powered date suggestions for your missions', 500, 'feature', '📍'),
  ('Vibe Boost', 'Your profile gets priority visibility for 24 hours', 400, 'powerup', '🚀'),
  ('Photo Frame: Golden Hour', 'Premium photo frame for your profile pictures', 150, 'cosmetic', '🌅'),
  ('Compatibility Deep Dive', 'Get a detailed AI analysis of any match', 350, 'feature', '🔬')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. User Rewards (redeemed rewards tracker)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_rewards (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id   UUID NOT NULL REFERENCES academy_rewards(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_rewards_user_id ON user_rewards(user_id);

ALTER TABLE user_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own redeemed rewards"
  ON user_rewards FOR SELECT
  USING (user_id = public.user_id());

CREATE POLICY "Users can redeem rewards"
  ON user_rewards FOR INSERT
  WITH CHECK (user_id = public.user_id());

-- ============================================================
-- 6. Enable Supabase Realtime for direct_messages
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
