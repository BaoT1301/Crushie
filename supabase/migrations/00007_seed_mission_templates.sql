-- ============================================================================
-- Migration: 00007_seed_mission_templates.sql
--
-- mission_templates was created in 00002 but never populated, and
-- mission_instances.template_id is NOT NULL REFERENCES mission_templates(id)
-- ON DELETE RESTRICT. On a fresh database that means every attempt to create a
-- mission instance fails a foreign key check, so the missions feature is dead
-- on arrival rather than merely empty.
--
-- These twelve cover the four mission_type values across all three difficulty
-- levels, so routing has something to choose from at every tier.
--
-- Idempotent: a unique index on title is added first so ON CONFLICT has a
-- target. Without it, ON CONFLICT DO NOTHING finds no conflict and a re-run
-- silently duplicates every row.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_templates_title
  ON mission_templates (title);

INSERT INTO mission_templates
  (title, description, mission_type, difficulty, location_query,
   weather_filter, base_points, duration_min, objectives, generated_by)
VALUES

-- ── Icebreakers: low stakes, short, indoors ─────────────────────────────────
('Two Truths, One Coffee',
 'Order for each other based on nothing but a guess, then explain the reasoning.',
 'icebreaker', 'easy', 'coffee shop',
 '{}'::jsonb, 80, 45,
 '[{"step":1,"task":"Order a drink for the other person without asking"},
   {"step":2,"task":"Explain what made you pick it"},
   {"step":3,"task":"Rate each other''s guess out of ten"}]'::jsonb, 'manual'),

('The Shelf Test',
 'Pick a book for the other person in under five minutes and defend the choice.',
 'icebreaker', 'easy', 'bookstore',
 '{}'::jsonb, 80, 40,
 '[{"step":1,"task":"Split up for five minutes"},
   {"step":2,"task":"Each choose one book for the other"},
   {"step":3,"task":"Make your case in sixty seconds"}]'::jsonb, 'manual'),

('Dealer''s Choice',
 'Neither of you picks the place. Walk in whichever direction has the better light.',
 'icebreaker', 'medium', 'neighbourhood walk',
 '{"no_rain": true}'::jsonb, 110, 60,
 '[{"step":1,"task":"Flip a coin at every corner for twenty minutes"},
   {"step":2,"task":"Stop at whatever you land on"},
   {"step":3,"task":"Stay at least half an hour"}]'::jsonb, 'manual'),

-- ── Mini dates: a real plan, still short ────────────────────────────────────
('Small Plates, Long Talk',
 'Somewhere you order in rounds, so the meal paces the conversation for you.',
 'mini_date', 'easy', 'tapas restaurant',
 '{}'::jsonb, 140, 90,
 '[{"step":1,"task":"Order three plates between you to start"},
   {"step":2,"task":"Each pick one more the other has never tried"},
   {"step":3,"task":"Decide together whether to stay for dessert"}]'::jsonb, 'manual'),

('Hands Busy',
 'Do something with your hands so the silences stop feeling like silences.',
 'mini_date', 'medium', 'pottery studio',
 '{}'::jsonb, 180, 120,
 '[{"step":1,"task":"Book a two hour session"},
   {"step":2,"task":"Make something for the other person, not yourself"},
   {"step":3,"task":"Swap at the end"}]'::jsonb, 'manual'),

('One Room Each',
 'A gallery, split up, then compare notes over a drink afterwards.',
 'mini_date', 'medium', 'art gallery',
 '{}'::jsonb, 160, 120,
 '[{"step":1,"task":"Separate at the entrance"},
   {"step":2,"task":"Each pick the one piece you would take home"},
   {"step":3,"task":"Find each other and argue about it"}]'::jsonb, 'manual'),

('The Market Run',
 'Shop for a meal together, then cook it. Cheap, long, and hard to fake.',
 'mini_date', 'hard', 'farmers market',
 '{"no_rain": true}'::jsonb, 220, 180,
 '[{"step":1,"task":"Set a budget before you arrive"},
   {"step":2,"task":"Each choose two ingredients the other must use"},
   {"step":3,"task":"Cook it together and eat it"}]'::jsonb, 'manual'),

-- ── Adventures: outdoors, weather dependent ─────────────────────────────────
('Sunset Deadline',
 'Get somewhere with a view before the light goes. The clock does the work.',
 'adventure', 'easy', 'scenic viewpoint',
 '{"no_rain": true, "max_temp": 32}'::jsonb, 150, 90,
 '[{"step":1,"task":"Check what time the sun sets"},
   {"step":2,"task":"Leave late enough that you have to hurry"},
   {"step":3,"task":"Stay until it is properly dark"}]'::jsonb, 'manual'),

('Off The Map',
 'Take public transport somewhere neither of you has been and work it out there.',
 'adventure', 'medium', 'public transit hub',
 '{"no_rain": true}'::jsonb, 200, 180,
 '[{"step":1,"task":"Pick a stop neither of you knows"},
   {"step":2,"task":"No planning before you arrive"},
   {"step":3,"task":"Find food without looking at reviews"}]'::jsonb, 'manual'),

('Uphill Both Ways',
 'Something slightly hard, done together. Skips about three dates of small talk.',
 'adventure', 'hard', 'hiking trail',
 '{"no_rain": true, "max_temp": 28}'::jsonb, 260, 240,
 '[{"step":1,"task":"Pick a route that will actually take effort"},
   {"step":2,"task":"Carry something for the other person"},
   {"step":3,"task":"Do not turn back early"}]'::jsonb, 'manual'),

-- ── Challenges: structured, competitive ─────────────────────────────────────
('Ninety Seconds',
 'Each explain something you genuinely care about. Ninety seconds, no interruptions.',
 'challenge', 'easy', 'quiet bar',
 '{}'::jsonb, 120, 60,
 '[{"step":1,"task":"Set a timer for ninety seconds each"},
   {"step":2,"task":"No questions until the timer ends"},
   {"step":3,"task":"Then ask three"}]'::jsonb, 'manual'),

('The Rematch',
 'Play something with a scoreboard. Losing gracefully tells you more than winning.',
 'challenge', 'medium', 'arcade bar',
 '{}'::jsonb, 170, 120,
 '[{"step":1,"task":"Pick a game neither of you is good at"},
   {"step":2,"task":"Best of five"},
   {"step":3,"task":"Loser picks where you go next"}]'::jsonb, 'manual')

ON CONFLICT (title) DO NOTHING;
