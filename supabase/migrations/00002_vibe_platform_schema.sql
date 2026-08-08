-- ============================================================================
-- Migration: 00002_vibe_platform_schema.sql
-- Description: Full "Date-Coach" platform schema — pgvector, vibe profiles,
--              missions, social graph, verification, and all RLS policies.
-- ============================================================================

-- ============================================================================
-- 0. Extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector for vibe similarity search

-- ============================================================================
-- 1. ENUM Types
-- ============================================================================
CREATE TYPE vibe_energy AS ENUM ('chill', 'moderate', 'high', 'chaotic');
CREATE TYPE connection_status AS ENUM ('pending', 'accepted', 'blocked');
CREATE TYPE mission_type AS ENUM ('icebreaker', 'mini_date', 'adventure', 'challenge');
CREATE TYPE mission_difficulty AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE mission_instance_status AS ENUM ('proposed', 'accepted', 'active', 'completed', 'expired', 'declined');
CREATE TYPE verification_type AS ENUM ('selfie_liveness', 'photo_match', 'phone', 'social_vouch');
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected', 'expired');
CREATE TYPE vouch_tag AS ENUM (
  'looks_like_photos', 'safe_vibes', 'great_conversation',
  'funny', 'respectful', 'adventurous', 'good_listener', 'creative'
);
CREATE TYPE analyzer_style AS ENUM ('direct', 'playful', 'intellectual', 'shy', 'adventurous');

-- ============================================================================
-- 2. Vibe Profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS vibe_profiles (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- AI-generated vibe card
  vibe_name     TEXT NOT NULL,                        -- e.g. "The Urban Minimalist"
  vibe_summary  TEXT,                                 -- 1-2 sentence description
  energy        vibe_energy NOT NULL DEFAULT 'moderate',
  -- Structured data
  mood_tags     TEXT[] DEFAULT '{}',                  -- e.g. {"cozy","artsy","nocturnal"}
  style_tags    TEXT[] DEFAULT '{}',                  -- from photo analysis
  interest_tags TEXT[] DEFAULT '{}',                  -- from quiz + photos
  quiz_answers  JSONB DEFAULT '{}',                   -- raw quiz response blob
  photo_urls    TEXT[] DEFAULT '{}',                  -- refs to analyzed images
  -- Vector embedding (cosine similarity via pgvector)
  embedding     vector(1536),                         -- 1536-dim vibe vector
  -- Metadata
  is_active     BOOLEAN DEFAULT TRUE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  -- One active profile per user
  CONSTRAINT uq_vibe_profiles_active_user
    UNIQUE (user_id) -- one row per user; deactivate old ones before creating new
);

-- Cosine similarity index — ivfflat for fast ANN queries
-- lists = sqrt(expected_rows); start with 100, tune after >10k rows
CREATE INDEX idx_vibe_profiles_embedding
  ON vibe_profiles
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_vibe_profiles_user_id ON vibe_profiles(user_id);
CREATE INDEX idx_vibe_profiles_energy ON vibe_profiles(energy);
CREATE INDEX idx_vibe_profiles_mood_tags ON vibe_profiles USING GIN(mood_tags);

-- ============================================================================
-- 3. Connections (Social Graph)
-- ============================================================================
CREATE TABLE IF NOT EXISTS connections (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        connection_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  -- Prevent duplicate connections (direction-insensitive checked via trigger)
  CONSTRAINT uq_connections_pair
    UNIQUE (requester_id, addressee_id),
  CONSTRAINT chk_connections_no_self
    CHECK (requester_id <> addressee_id)
);

CREATE INDEX idx_connections_requester ON connections(requester_id);
CREATE INDEX idx_connections_addressee ON connections(addressee_id);
CREATE INDEX idx_connections_status ON connections(status);

-- ============================================================================
-- 4. Vibe Matches (AI-generated pairings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vibe_matches (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  similarity      FLOAT NOT NULL,                     -- cosine similarity score 0..1
  compatibility   JSONB DEFAULT '{}',                 -- AI breakdown: {energy: 0.9, interests: 0.7, …}
  is_mutual       BOOLEAN DEFAULT FALSE NOT NULL,     -- both users have "liked"
  matched_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at      TIMESTAMPTZ,                        -- optional TTL
  CONSTRAINT uq_vibe_matches_pair
    UNIQUE (user_a_id, user_b_id),
  CONSTRAINT chk_vibe_matches_no_self
    CHECK (user_a_id <> user_b_id)
);

CREATE INDEX idx_vibe_matches_user_a ON vibe_matches(user_a_id);
CREATE INDEX idx_vibe_matches_user_b ON vibe_matches(user_b_id);
CREATE INDEX idx_vibe_matches_similarity ON vibe_matches(similarity DESC);

-- ============================================================================
-- 5. Mission Templates (reusable catalogue)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mission_templates (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  mission_type    mission_type NOT NULL,
  difficulty      mission_difficulty NOT NULL DEFAULT 'easy',
  -- Location / context
  location_query  TEXT,                                -- Google Places search term
  weather_filter  JSONB DEFAULT '{}',                  -- e.g. {"max_temp":35,"no_rain":true}
  -- Gamification
  base_points     INT NOT NULL DEFAULT 100,
  duration_min    INT NOT NULL DEFAULT 60,             -- minutes
  -- Task definition
  objectives      JSONB NOT NULL DEFAULT '[]',         -- [{"step":1,"task":"Find the neon sign"}]
  -- AI generation metadata
  generated_by    TEXT,                                -- "gemini-2.5-flash" or "manual"
  prompt_hash     TEXT,                                -- SHA-256 of the prompt that created it
  -- Metadata
  is_active       BOOLEAN DEFAULT TRUE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_mission_templates_type ON mission_templates(mission_type);
CREATE INDEX idx_mission_templates_difficulty ON mission_templates(difficulty);

-- ============================================================================
-- 6. Mission Instances (scalable execution — one per matched pair per mission)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mission_instances (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id       UUID NOT NULL REFERENCES mission_templates(id) ON DELETE RESTRICT,
  match_id          UUID NOT NULL REFERENCES vibe_matches(id) ON DELETE CASCADE,
  -- Instance-specific overrides (AI-personalised)
  custom_title      TEXT,
  custom_objectives JSONB,                             -- override template objectives
  location_name     TEXT,                              -- resolved place name
  location_lat      DOUBLE PRECISION,
  location_lng      DOUBLE PRECISION,
  location_place_id TEXT,                              -- Google Places ID
  -- State machine
  status            mission_instance_status NOT NULL DEFAULT 'proposed',
  proposed_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  accepted_at       TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  -- Gamification
  points_awarded    INT DEFAULT 0,
  partner_discount  TEXT,                              -- coupon code if applicable
  -- Checkin verification
  checkin_proof     JSONB DEFAULT '{}',                -- {"selfie_url":"…","geo":{lat,lng},"ts":"…"}
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_mission_instances_match ON mission_instances(match_id);
CREATE INDEX idx_mission_instances_status ON mission_instances(status);
CREATE INDEX idx_mission_instances_template ON mission_instances(template_id);

-- ============================================================================
-- 7. User Mission Progress (per-user state within an instance)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_mission_progress (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id       UUID NOT NULL REFERENCES mission_instances(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  has_accepted      BOOLEAN DEFAULT FALSE NOT NULL,
  objectives_done   JSONB DEFAULT '[]',                -- [{"step":1,"done":true,"ts":"…"}]
  checked_in        BOOLEAN DEFAULT FALSE NOT NULL,
  points_earned     INT DEFAULT 0,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT uq_user_mission_progress
    UNIQUE (instance_id, user_id)
);

CREATE INDEX idx_user_mission_progress_user ON user_mission_progress(user_id);
CREATE INDEX idx_user_mission_progress_instance ON user_mission_progress(instance_id);

-- ============================================================================
-- 8. Verification & Liveness
-- ============================================================================
CREATE TABLE IF NOT EXISTS verifications (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            verification_type NOT NULL,
  status          verification_status NOT NULL DEFAULT 'pending',
  -- Proof (processed in-memory, hash stored — never raw images)
  proof_hash      TEXT,                                -- SHA-256 of the verification artifact
  metadata        JSONB DEFAULT '{}',                  -- model confidence, etc.
  -- Timestamps
  requested_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  verified_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ                          -- liveness checks expire after 90 days
);

CREATE INDEX idx_verifications_user ON verifications(user_id);
CREATE INDEX idx_verifications_status ON verifications(status);

-- ============================================================================
-- 9. Social Vouching (Friend-Filter)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vibe_vouches (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  voucher_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- the friend
  subject_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- the person being vouched for
  tag           vouch_tag NOT NULL,
  is_anonymous  BOOLEAN DEFAULT TRUE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  -- One vouch per tag per pair
  CONSTRAINT uq_vibe_vouches_pair_tag
    UNIQUE (voucher_id, subject_id, tag),
  CONSTRAINT chk_vibe_vouches_no_self
    CHECK (voucher_id <> subject_id)
);

CREATE INDEX idx_vibe_vouches_subject ON vibe_vouches(subject_id);
CREATE INDEX idx_vibe_vouches_voucher ON vibe_vouches(voucher_id);

-- ============================================================================
-- 10. Crush Privacy Cloak
-- ============================================================================
CREATE TABLE IF NOT EXISTS crush_list (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crush_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active     BOOLEAN DEFAULT TRUE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT uq_crush_list_pair
    UNIQUE (user_id, crush_user_id),
  CONSTRAINT chk_crush_list_no_self
    CHECK (user_id <> crush_user_id)
);

CREATE INDEX idx_crush_list_user ON crush_list(user_id);
CREATE INDEX idx_crush_list_crush ON crush_list(crush_user_id);

-- ============================================================================
-- 11. Analyzer Sessions (screenshot analysis — ephemeral, never stored on disk)
-- ============================================================================
CREATE TABLE IF NOT EXISTS analyzer_sessions (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Input metadata (image itself is NOT stored — only hash for dedup)
  image_hash        TEXT NOT NULL,                     -- SHA-256 of the input image
  hint_tags         TEXT[] DEFAULT '{}',               -- e.g. {"university","hiking"}
  -- AI output
  predicted_style   analyzer_style,
  vibe_prediction   JSONB DEFAULT '{}',                -- structured AI analysis
  conversation_openers TEXT[] DEFAULT '{}',            -- 3 openers
  date_suggestions  JSONB DEFAULT '[]',                -- personalized date ideas
  -- Metadata
  model_version     TEXT,                              -- "gemini-2.5-flash"
  latency_ms        INT,                               -- track <3s SLA
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_analyzer_sessions_user ON analyzer_sessions(user_id);

-- ============================================================================
-- 12. Vibe Points Ledger (gamification)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vibe_points_ledger (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta         INT NOT NULL,                          -- positive = earned, negative = spent
  reason        TEXT NOT NULL,                         -- e.g. "mission_complete", "vouch_received"
  reference_id  UUID,                                  -- FK to the source (mission_instance, vouch, etc.)
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_vibe_points_user ON vibe_points_ledger(user_id);
CREATE INDEX idx_vibe_points_created ON vibe_points_ledger(created_at DESC);

-- ============================================================================
-- 13. Utility: Cosine Similarity Search Function
-- ============================================================================
CREATE OR REPLACE FUNCTION find_similar_vibes(
  query_embedding vector(1536),
  match_count     INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  user_id     TEXT,
  vibe_name   TEXT,
  similarity  FLOAT
) AS $$
  SELECT
    vp.user_id,
    vp.vibe_name,
    1 - (vp.embedding <=> query_embedding) AS similarity
  FROM vibe_profiles vp
  WHERE vp.is_active = TRUE
    AND vp.embedding IS NOT NULL
    AND 1 - (vp.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY vp.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- 14. Utility: Mutual Match Warning Function
-- ============================================================================
CREATE OR REPLACE FUNCTION check_mutual_connections(
  p_user_id TEXT,
  p_target_id TEXT
)
RETURNS TABLE (
  mutual_friend_id   TEXT,
  connection_type    TEXT
) AS $$
  SELECT
    c1.addressee_id AS mutual_friend_id,
    'mutual_connection' AS connection_type
  FROM connections c1
  JOIN connections c2 ON c1.addressee_id = c2.requester_id
    OR c1.addressee_id = c2.addressee_id
  WHERE c1.requester_id = p_user_id
    AND c1.status = 'accepted'
    AND (c2.requester_id = p_target_id OR c2.addressee_id = p_target_id)
    AND c2.status = 'accepted'
    AND c1.addressee_id <> p_user_id
    AND c1.addressee_id <> p_target_id;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- 15. Row Level Security — all new tables
-- ============================================================================

-- 15a. vibe_profiles
ALTER TABLE vibe_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own vibe profile"
  ON vibe_profiles FOR SELECT
  USING (user_id = public.user_id());

CREATE POLICY "Users can read active vibe profiles for matching"
  ON vibe_profiles FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Users can insert own vibe profile"
  ON vibe_profiles FOR INSERT
  WITH CHECK (user_id = public.user_id());

CREATE POLICY "Users can update own vibe profile"
  ON vibe_profiles FOR UPDATE
  USING (user_id = public.user_id());

CREATE POLICY "Users can delete own vibe profile"
  ON vibe_profiles FOR DELETE
  USING (user_id = public.user_id());

-- 15b. connections
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own connections"
  ON connections FOR SELECT
  USING (requester_id = public.user_id() OR addressee_id = public.user_id());

CREATE POLICY "Users can create connection requests"
  ON connections FOR INSERT
  WITH CHECK (requester_id = public.user_id());

CREATE POLICY "Users can update connections they're part of"
  ON connections FOR UPDATE
  USING (requester_id = public.user_id() OR addressee_id = public.user_id());

CREATE POLICY "Users can delete own sent requests"
  ON connections FOR DELETE
  USING (requester_id = public.user_id());

-- 15c. vibe_matches
ALTER TABLE vibe_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own matches"
  ON vibe_matches FOR SELECT
  USING (user_a_id = public.user_id() OR user_b_id = public.user_id());

-- Matches are created by the system (service role), not directly by users
-- No INSERT/UPDATE/DELETE policies for regular users

-- 15d. mission_templates (read-only for users)
ALTER TABLE mission_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active mission templates"
  ON mission_templates FOR SELECT
  USING (is_active = TRUE);

-- Templates created by service role only

-- 15e. mission_instances
ALTER TABLE mission_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read mission instances for their matches"
  ON mission_instances FOR SELECT
  USING (
    match_id IN (
      SELECT id FROM vibe_matches
      WHERE user_a_id = public.user_id() OR user_b_id = public.user_id()
    )
  );

CREATE POLICY "Users can update mission instances for their matches"
  ON mission_instances FOR UPDATE
  USING (
    match_id IN (
      SELECT id FROM vibe_matches
      WHERE user_a_id = public.user_id() OR user_b_id = public.user_id()
    )
  );

-- 15f. user_mission_progress
ALTER TABLE user_mission_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own mission progress"
  ON user_mission_progress FOR SELECT
  USING (user_id = public.user_id());

CREATE POLICY "Users can insert own mission progress"
  ON user_mission_progress FOR INSERT
  WITH CHECK (user_id = public.user_id());

CREATE POLICY "Users can update own mission progress"
  ON user_mission_progress FOR UPDATE
  USING (user_id = public.user_id());

-- 15g. verifications
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own verifications"
  ON verifications FOR SELECT
  USING (user_id = public.user_id());

CREATE POLICY "Users can request own verifications"
  ON verifications FOR INSERT
  WITH CHECK (user_id = public.user_id());

-- Verification status updated by service role only

-- 15h. vibe_vouches
ALTER TABLE vibe_vouches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read vouches about themselves"
  ON vibe_vouches FOR SELECT
  USING (subject_id = public.user_id());

CREATE POLICY "Users can read vouches they gave"
  ON vibe_vouches FOR SELECT
  USING (voucher_id = public.user_id());

CREATE POLICY "Users can create vouches for connections"
  ON vibe_vouches FOR INSERT
  WITH CHECK (voucher_id = public.user_id());

CREATE POLICY "Users can delete own vouches"
  ON vibe_vouches FOR DELETE
  USING (voucher_id = public.user_id());

-- 15i. crush_list
ALTER TABLE crush_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own crush list"
  ON crush_list FOR SELECT
  USING (user_id = public.user_id());

CREATE POLICY "Users can manage own crush list"
  ON crush_list FOR INSERT
  WITH CHECK (user_id = public.user_id());

CREATE POLICY "Users can update own crush list"
  ON crush_list FOR UPDATE
  USING (user_id = public.user_id());

CREATE POLICY "Users can delete from own crush list"
  ON crush_list FOR DELETE
  USING (user_id = public.user_id());

-- 15j. analyzer_sessions
ALTER TABLE analyzer_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own analyzer sessions"
  ON analyzer_sessions FOR SELECT
  USING (user_id = public.user_id());

CREATE POLICY "Users can create own analyzer sessions"
  ON analyzer_sessions FOR INSERT
  WITH CHECK (user_id = public.user_id());

-- Analyzer sessions are append-only (no update/delete)

-- 15k. vibe_points_ledger
ALTER TABLE vibe_points_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own points ledger"
  ON vibe_points_ledger FOR SELECT
  USING (user_id = public.user_id());

-- Points awarded by service role only
