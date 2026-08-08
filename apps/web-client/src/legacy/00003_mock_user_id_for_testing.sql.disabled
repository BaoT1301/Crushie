-- ============================================================================
-- Migration: 00003_mock_user_id_for_testing.sql
-- Description: Override public.user_id() to return a test user for local dev
-- ============================================================================

-- Override public.user_id() to handle missing JWT gracefully
CREATE OR REPLACE FUNCTION public.user_id()
RETURNS TEXT AS $$
BEGIN
  -- Try to get from JWT first
  DECLARE
    jwt_user_id TEXT;
  BEGIN
    jwt_user_id := COALESCE(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.jwt.claims', true)::json->>'user_id'
    );
    
    -- If we have a JWT user, return it
    IF jwt_user_id IS NOT NULL AND jwt_user_id != '' THEN
      RETURN jwt_user_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- JWT parsing failed, continue to test user
    NULL;
  END;
  
  -- Return test user for local development
  RETURN 'test-user-123';
END;
$$ LANGUAGE plpgsql STABLE;

-- Create test user if doesn't exist
INSERT INTO users (id, email, first_name, last_name, is_active, created_at, updated_at)
VALUES (
  'test-user-123', 
  'test@example.com', 
  'Test', 
  'User', 
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  updated_at = NOW();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_id() TO anon;
