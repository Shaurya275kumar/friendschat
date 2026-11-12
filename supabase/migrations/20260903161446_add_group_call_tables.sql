/*
# Add group call support tables

## Changes

1. Create `group_calls` table to track active group calls:
   - id (uuid, primary key) - unique call ID
   - chat_id (uuid, FK to chats) - which group the call belongs to
   - caller_id (uuid, FK to profiles) - who started the call
   - call_type (text) - 'audio' or 'video'
   - status (text) - 'active' or 'ended'
   - created_at (timestamptz)

2. Create `group_call_participants` table to track who is in which call:
   - id (uuid, primary key)
   - call_id (uuid, FK to group_calls)
   - user_id (uuid, FK to profiles)
   - joined_at (timestamptz)
   - left_at (timestamptz, nullable)
   - is_muted (boolean, default false)
   - is_camera_off (boolean, default false)
   - Unique constraint on (call_id, user_id) to prevent duplicates

3. Enable RLS on both tables with membership-based policies.

## Security
- RLS ensures only group members can see calls
- Users can only modify their own participant state
- Membership validated via chat_participants table
*/

CREATE TABLE IF NOT EXISTS group_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  call_type text NOT NULL DEFAULT 'audio' CHECK (call_type IN ('audio', 'video')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE group_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_group_calls" ON group_calls;
CREATE POLICY "select_group_calls"
ON group_calls FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM chat_participants
    WHERE chat_participants.chat_id = group_calls.chat_id
    AND chat_participants.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "insert_group_calls" ON group_calls;
CREATE POLICY "insert_group_calls"
ON group_calls FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM chat_participants
    WHERE chat_participants.chat_id = group_calls.chat_id
    AND chat_participants.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "update_group_calls" ON group_calls;
CREATE POLICY "update_group_calls"
ON group_calls FOR UPDATE
TO authenticated
USING (
  caller_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM chat_participants
    WHERE chat_participants.chat_id = group_calls.chat_id
    AND chat_participants.user_id = auth.uid()
  )
)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS group_call_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES group_calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  is_muted boolean NOT NULL DEFAULT false,
  is_camera_off boolean NOT NULL DEFAULT false,
  UNIQUE(call_id, user_id)
);

ALTER TABLE group_call_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_group_call_participants" ON group_call_participants;
CREATE POLICY "select_group_call_participants"
ON group_call_participants FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM group_calls
    JOIN chat_participants ON chat_participants.chat_id = group_calls.chat_id
    WHERE group_calls.id = group_call_participants.call_id
    AND chat_participants.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "insert_group_call_participants" ON group_call_participants;
CREATE POLICY "insert_group_call_participants"
ON group_call_participants FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM group_calls
    JOIN chat_participants ON chat_participants.chat_id = group_calls.chat_id
    WHERE group_calls.id = group_call_participants.call_id
    AND chat_participants.user_id = auth.uid()
    AND group_calls.status = 'active'
  )
);

DROP POLICY IF EXISTS "update_group_call_participants" ON group_call_participants;
CREATE POLICY "update_group_call_participants"
ON group_call_participants FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_group_call_participants" ON group_call_participants;
CREATE POLICY "delete_group_call_participants"
ON group_call_participants FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_group_calls_chat_id ON group_calls(chat_id);
CREATE INDEX IF NOT EXISTS idx_group_calls_status ON group_calls(status);
CREATE INDEX IF NOT EXISTS idx_group_call_participants_call_id ON group_call_participants(call_id);
CREATE INDEX IF NOT EXISTS idx_group_call_participants_user_id ON group_call_participants(user_id);

ALTER TABLE group_calls REPLICA IDENTITY FULL;
ALTER TABLE group_call_participants REPLICA IDENTITY FULL;
