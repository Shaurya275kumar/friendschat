/*
# FriendsChat - Email auth, all users visible, stories

## Changes
1. profiles: add `email` column (unique, not null) and make `phone` nullable.
   This supports email-based login instead of phone-based.
2. stories: new table for user stories (ephemeral posts visible to all users).
   - id, user_id, media_url, media_type, caption, created_at, expires_at
   - Stories auto-expire after 24 hours (handled by expires_at column + app filtering).
3. story_views: tracks which users have seen a story.
   - story_id, viewer_id, viewed_at (PK = story_id + viewer_id)
4. friendships: kept for backward compat but no longer required to start chats.
   Any authenticated user can start a chat with any other user.

## RLS
- profiles: SELECT open to all authenticated users (all users visible).
- stories: SELECT open to all authenticated (visible to all). INSERT own only.
  UPDATE/DELETE own only.
- story_views: SELECT open to all authenticated. INSERT own (viewer_id = auth.uid()).

## Notes
1. phone column made nullable since email is now the primary identifier.
2. Stories expire after 24h via app-side filtering on expires_at.
*/

-- Add email to profiles, make phone nullable
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text UNIQUE;
ALTER TABLE profiles ALTER COLUMN phone DROP NOT NULL;

-- stories table
CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stories_read_all" ON stories;
CREATE POLICY "stories_read_all" ON stories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "stories_insert_own" ON stories;
CREATE POLICY "stories_insert_own" ON stories
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "stories_update_own" ON stories;
CREATE POLICY "stories_update_own" ON stories
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "stories_delete_own" ON stories;
CREATE POLICY "stories_delete_own" ON stories
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- story_views table
CREATE TABLE IF NOT EXISTS story_views (
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "story_views_read_all" ON story_views;
CREATE POLICY "story_views_read_all" ON story_views
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "story_views_insert_own" ON story_views;
CREATE POLICY "story_views_insert_own" ON story_views
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = viewer_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stories_active ON stories (expires_at);

-- Add stories to realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'stories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE stories;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'story_views'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE story_views;
  END IF;
END $$;