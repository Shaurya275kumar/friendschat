/*
# Call signaling table for WebRTC voice calls

## Purpose
Stores signaling messages (SDP offers/answers, ICE candidates, hangup/reject)
exchanged between two users to establish a WebRTC peer-to-peer voice call.

## New Tables
- `call_signaling`
  - `id` (uuid, primary key)
  - `caller_id` (uuid, not null) — the user who initiated the call
  - `callee_id` (uuid, not null) — the user receiving the call
  - `type` (text, not null) — 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'reject'
  - `payload` (jsonb, not null) — the signaling data (SDP or ICE candidate)
  - `created_at` (timestamptz, default now())

## Security
- RLS enabled.
- Both caller and callee can read messages where they are a participant.
- Both caller and callee can insert messages where they are a participant.
- Append-only: no update or delete policies.
*/

CREATE TABLE IF NOT EXISTS call_signaling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE call_signaling ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_calls" ON call_signaling;
CREATE POLICY "select_own_calls" ON call_signaling FOR SELECT
  TO authenticated USING (auth.uid() = caller_id OR auth.uid() = callee_id);

DROP POLICY IF EXISTS "insert_own_calls" ON call_signaling;
CREATE POLICY "insert_own_calls" ON call_signaling FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE INDEX IF NOT EXISTS idx_call_signaling_participants ON call_signaling (caller_id, callee_id, created_at);
