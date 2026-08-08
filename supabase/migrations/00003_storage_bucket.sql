-- ============================================================================
-- Migration: 00003_storage_bucket.sql
-- Description: Create public storage bucket for user uploads (onboarding
--              photos, profile images). Files are scoped under {userId}/.
-- ============================================================================

-- 1. Create the public bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-uploads',
  'user-uploads',
  TRUE,                                           -- locked down by 00006 immediately after
  10485760,                                       -- 10 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies for storage.objects
--    (Supabase Storage uses the `storage.objects` table internally)

-- Superseded by 00006_private_uploads.sql, which flips this bucket to private
-- and replaces this policy with an owner-scoped one. Kept as-is so the
-- migration history stays honest about what was originally created.
CREATE POLICY "Public read access on user-uploads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user-uploads');

-- Allow authenticated users to upload only under their own userId prefix.
-- The upload path is validated by the Hono/tRPC layer, but this policy
-- is an additional guardrail at the DB level.
CREATE POLICY "Authenticated users can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user-uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own files
CREATE POLICY "Authenticated users can delete own files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user-uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update their own files
CREATE POLICY "Authenticated users can update own files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'user-uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
