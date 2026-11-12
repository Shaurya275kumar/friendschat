/*
# Add call history

## Summary
Records every one-to-one call so each user can review their past calls on a
Calls screen. Each call produces one row for each participant, written by that
participant's app when the call ends.

## New Tables
- `call_history`
  - `id` (uuid, primary key)
  - `user_id` (uuid, the person viewing this history entry; defaults to the signed-in user)
  - `peer_id` (uuid, the other person in the call)
  - `call_id` (uuid, the call session identifier shared by both participants)
  - `direction` (text, 'outgoing' or 'incoming' from the viewer's perspective)
  - `call_type` (text, 'audio' or 'video')
  - `status` (text, 'completed', 'missed', 'declined' or 'cancelled')
  - `duration_seconds` (integer, length of the call once connected, 0 otherwise)
  - `created_at` (timestamptz, when the entry was recorded)

## Security
- Row level security is enabled.
- Users can read only their own history entries.
- Users can insert entries only for themselves.
- No update or delete access, so history is append-only.

## Important Notes
1. Each user has at most one entry per call (unique on user and call).
2. The history is sorted by recording time, newest first, via an index.
*/

CREATE TABLE IF NOT EXISTS call_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  peer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  call_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('outgoing', 'incoming')),
  call_type text NOT NULL CHECK (call_type IN ('audio', 'video')),
  status text NOT NULL CHECK (status IN ('completed', 'missed', 'declined', 'cancelled')),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, call_id)
);

CREATE INDEX IF NOT EXISTS idx_call_history_user_created ON call_history (user_id, created_at DESC);

ALTER TABLE call_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON call_history TO authenticated;

DROP POLICY IF EXISTS "select_own_call_history" ON call_history;
CREATE POLICY "select_own_call_history" ON call_history FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_call_history" ON call_history;
CREATE POLICY "insert_own_call_history" ON call_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
