/*
# Message deletions table for "delete for me" feature

## Purpose
Tracks which messages a user has deleted for themselves only.
This is separate from the existing "delete for everyone" which sets
deleted_at on the messages table itself.

## New Tables
- `message_deletions`
  - `id` (uuid, primary key)
  - `message_id` (uuid, not null, references messages)
  - `user_id` (uuid, not null, references auth.users)
  - `deleted_at` (timestamptz, default now())
  - Unique constraint on (message_id, user_id) to prevent duplicates

## Security
- RLS enabled.
- Users can only see and create their own deletion records.
*/

CREATE TABLE IF NOT EXISTS message_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  deleted_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id)
);

ALTER TABLE message_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_deletions" ON message_deletions;
CREATE POLICY "select_own_deletions" ON message_deletions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_deletions" ON message_deletions;
CREATE POLICY "insert_own_deletions" ON message_deletions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_deletions" ON message_deletions;
CREATE POLICY "delete_own_deletions" ON message_deletions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'message_deletions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_deletions;
  END IF;
END $$;
