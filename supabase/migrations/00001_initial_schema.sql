-- Enable RLS on all tables
-- This migration sets up the base RLS infrastructure for Clerk JWT integration

-- Function to get the current user ID from the Clerk JWT.
--
-- Lives in `public`, not `auth`. Supabase reserves the auth schema and denies
-- CREATE to every role including postgres, so `CREATE FUNCTION auth.user_id()`
-- fails with 42501 permission denied. auth.uid() and auth.role() are Supabase
-- built-ins and are still callable; this is our own helper, so it belongs in
-- public alongside the tables whose policies call it.
CREATE OR REPLACE FUNCTION public.user_id()
RETURNS TEXT AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::json->>'sub',
    current_setting('request.jwt.claims', true)::json->>'user_id'
  );
$$ LANGUAGE SQL STABLE;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can read own data" ON users
  FOR SELECT
  USING (id = public.user_id());

-- Users can update their own data
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE
  USING (id = public.user_id());

-- Examples table
CREATE TABLE IF NOT EXISTS examples (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS on examples table
ALTER TABLE examples ENABLE ROW LEVEL SECURITY;

-- Users can read their own examples or public ones
CREATE POLICY "Users can read own or public examples" ON examples
  FOR SELECT
  USING (user_id = public.user_id() OR is_public = TRUE);

-- Users can insert their own examples
CREATE POLICY "Users can insert own examples" ON examples
  FOR INSERT
  WITH CHECK (user_id = public.user_id());

-- Users can update their own examples
CREATE POLICY "Users can update own examples" ON examples
  FOR UPDATE
  USING (user_id = public.user_id());

-- Users can delete their own examples
CREATE POLICY "Users can delete own examples" ON examples
  FOR DELETE
  USING (user_id = public.user_id());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_examples_user_id ON examples(user_id);
CREATE INDEX IF NOT EXISTS idx_examples_is_public ON examples(is_public);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
