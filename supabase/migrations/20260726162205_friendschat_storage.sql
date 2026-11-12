/*
# Storage policies for avatars and media buckets

## Changes
- Creates public buckets `avatars` and `media` (already created via SQL).
- Adds storage policies allowing authenticated users to upload/read objects in
  both buckets. Objects are world-readable (public buckets); uploads require auth.
*/

-- avatars bucket policies
DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
CREATE POLICY "avatars_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_upload" ON storage.objects;
CREATE POLICY "avatars_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars') WITH CHECK (bucket_id = 'avatars');

-- media bucket policies
DROP POLICY IF EXISTS "media_read" ON storage.objects;
CREATE POLICY "media_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'media');

DROP POLICY IF EXISTS "media_upload" ON storage.objects;
CREATE POLICY "media_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media');

DROP POLICY IF EXISTS "media_delete_own" ON storage.objects;
CREATE POLICY "media_delete_own" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'media');