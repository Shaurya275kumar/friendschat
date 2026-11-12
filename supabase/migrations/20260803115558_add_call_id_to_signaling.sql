/*
# Add call_id to call_signaling

1. Changes
- Add `call_id` (uuid) column to `call_signaling` to isolate messages per call session.
- Default to `gen_random_uuid()` so existing rows get a value.
- Add an index on `call_id` for faster lookups.
2. Security
- No RLS changes; existing policies remain in effect.
3. Notes
- The call_id is generated client-side per call and included in every signaling insert,
  so both caller and callee can filter messages to only the current call.
*/

ALTER TABLE call_signaling
  ADD COLUMN IF NOT EXISTS call_id uuid DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_call_signaling_call_id ON call_signaling(call_id);
