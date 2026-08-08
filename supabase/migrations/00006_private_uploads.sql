-- ============================================================================
-- 00006_private_uploads.sql
--
-- ACTIVE. The code change this depended on is done, so this now applies with
-- the rest of the set.
--
-- WHAT THIS DEPENDED ON
--
-- `user-uploads` is currently public-read with no auth predicate (00003).
-- Everything uploaded -- onboarding photos, screenshots of other people's
-- dating profiles, verification selfies -- sits at a permanent unauthenticated
-- URL that anyone with the link can fetch, forever, with no login.
--
-- storage.ts previously called getPublicUrl() in five places and persisted the
-- resulting absolute URL. Locking the bucket without changing that would have
-- 404'd every image in the app.
--
-- It now uses createSignedUrl() via getSignedUrl(), and returns both a signed
-- url (for immediate display) and the durable object path. toStoragePath()
-- accepts either a bare path or a legacy absolute public URL and extracts the
-- path, so rows written before this migration keep resolving instead of
-- breaking.
--
-- Signed URLs last SIGNED_URL_TTL_SECONDS (7 days) and are regenerated on read
-- via getSignedUrl() / getSignedUrls().
-- ============================================================================

UPDATE storage.buckets
SET public = FALSE
WHERE id = 'user-uploads';

DROP POLICY IF EXISTS "Public read access on user-uploads" ON storage.objects;

-- Files live under a {userId}/ prefix, so the first path segment is the owner.
CREATE POLICY "Users can read own uploads"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user-uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
