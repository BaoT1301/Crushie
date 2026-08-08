-- ============================================================================
-- Migration: 00011_seed_demo_profiles.sql
--
-- Seeds eight demo vibe profiles so Match Center has candidates to rank.
--
-- WHY THIS IS NEEDED
--
-- find_similar_vibes() compares the caller's embedding against other active
-- profiles. On an empty database there is nothing to compare against, so
-- Discover renders "No candidates yet" no matter what the user does.
--
-- IMPORTANT: this alone is not sufficient. The query also reads
--   (SELECT embedding FROM vibe_profiles WHERE user_id = <caller>)
-- so the signed-in user still has to complete /on-board before anything
-- appears. These seeds are the other half of that comparison.
--
-- HONESTY NOTE
--
-- These are clearly-labelled demo accounts, not fabricated real users. Ids are
-- prefixed `demo_`, emails are @demo.crushie.local (a reserved, non-routable
-- domain), and every display name reads as a persona rather than a person.
-- Nothing here is presented anywhere as a real signup or a usage statistic.
-- Delete them before launch with:
--   DELETE FROM users WHERE id LIKE 'demo_%';
-- which cascades to vibe_profiles.
-- ============================================================================


-- Deterministic pseudo-embedding.
--
-- Real embeddings come from the model. For demo data we only need vectors that
-- are stable, distinct from each other, and close enough to a real distribution
-- that cosine similarity returns a spread of scores rather than all-ties. The
-- seed varies the frequency so each persona lands in a different direction.
CREATE OR REPLACE FUNCTION public.demo_embedding(seed INT)
RETURNS vector(1536) AS $$
  SELECT ('[' || string_agg(
            round(sin(i * (seed * 0.137 + 0.4))::numeric, 6)::text, ','
            ORDER BY i) || ']')::vector(1536)
  FROM generate_series(1, 1536) AS i;
$$ LANGUAGE SQL IMMUTABLE;


-- ── Demo accounts ───────────────────────────────────────────────────────────
INSERT INTO users (id, email, first_name, last_name, is_active)
VALUES
  ('demo_maya',   'maya@demo.crushie.local',   'Maya',   'Demo', TRUE),
  ('demo_theo',   'theo@demo.crushie.local',   'Theo',   'Demo', TRUE),
  ('demo_priya',  'priya@demo.crushie.local',  'Priya',  'Demo', TRUE),
  ('demo_jonas',  'jonas@demo.crushie.local',  'Jonas',  'Demo', TRUE),
  ('demo_amara',  'amara@demo.crushie.local',  'Amara',  'Demo', TRUE),
  ('demo_sunho',  'sunho@demo.crushie.local',  'Sun-ho', 'Demo', TRUE),
  ('demo_lena',   'lena@demo.crushie.local',   'Lena',   'Demo', TRUE),
  ('demo_rafael', 'rafael@demo.crushie.local', 'Rafael', 'Demo', TRUE)
ON CONFLICT (id) DO NOTHING;


-- ── Vibe profiles ───────────────────────────────────────────────────────────
INSERT INTO vibe_profiles
  (user_id, vibe_name, vibe_summary, energy, mood_tags, style_tags,
   interest_tags, embedding, is_active)
VALUES
  ('demo_maya', 'The Quiet Cartographer',
   'Collects places the way other people collect records. Will remember the cafe you mentioned once.',
   'chill',
   ARRAY['curious','observant','warm'], ARRAY['secondhand knits','film camera'],
   ARRAY['bookshops','film photography','long walks'],
   public.demo_embedding(1), TRUE),

  ('demo_theo', 'The Sunday Climber',
   'Treats a hard route the way most people treat a crossword. Loud laugh, low ego.',
   'high',
   ARRAY['warm','competitive','open'], ARRAY['chalk dust','worn trainers'],
   ARRAY['bouldering','ramen','trail running'],
   public.demo_embedding(2), TRUE),

  ('demo_priya', 'The Late Gallery',
   'Argues about paintings with her hands. Reads the wall text, then disagrees with it.',
   'moderate',
   ARRAY['sharp','thoughtful','playful'], ARRAY['tailored','one bold ring'],
   ARRAY['modern art','architecture','natural wine'],
   public.demo_embedding(3), TRUE),

  ('demo_jonas', 'The Slow Kitchen',
   'Cooks for people as a first language. The good knife is the only expensive thing he owns.',
   'chill',
   ARRAY['generous','steady','dry humour'], ARRAY['apron','rolled sleeves'],
   ARRAY['cooking','farmers markets','vinyl'],
   public.demo_embedding(4), TRUE),

  ('demo_amara', 'The Two Continents',
   'Has a story for every scar and none of them start at home. Terrible at packing light.',
   'chaotic',
   ARRAY['bold','restless','funny'], ARRAY['sun bleached','stacked bracelets'],
   ARRAY['travel','street food','live music'],
   public.demo_embedding(5), TRUE),

  ('demo_sunho', 'The Morning Shift',
   'Up before everyone. Runs, reads, then arrives already three thoughts ahead.',
   'moderate',
   ARRAY['calm','disciplined','kind'], ARRAY['minimal','good coat'],
   ARRAY['running','poetry','coffee'],
   public.demo_embedding(6), TRUE),

  ('demo_lena', 'The Studio Light',
   'Makes things with her hands and gets quiet while she does it. Ask about the kiln.',
   'chill',
   ARRAY['gentle','focused','wry'], ARRAY['clay under nails','oversized shirts'],
   ARRAY['ceramics','botany','ambient music'],
   public.demo_embedding(7), TRUE),

  ('demo_rafael', 'The Last Round',
   'Closes the bar because the conversation got good, not because he wanted another.',
   'high',
   ARRAY['warm','talkative','curious'], ARRAY['leather jacket','battered boots'],
   ARRAY['football','history podcasts','cocktails'],
   public.demo_embedding(8), TRUE)
ON CONFLICT DO NOTHING;
