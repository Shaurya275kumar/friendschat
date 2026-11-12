/*
# Add sender_id to call_signaling + enable realtime

## Changes
1. Add `sender_id` column to `call_signaling` so the receiver can
   distinguish who sent each signaling message and filter accordingly.
2. Add `call_signaling` to the `supabase_realtime` publication so
   INSERT events are pushed to subscribed clients in real time.
3. Add an RLS policy for the new sender_id column (no extra policy needed
   since the existing select/insert policies cover all columns).

## Modified Tables
- `call_signaling`: added `sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
*/

ALTER TABLE call_signaling
  ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE call_signaling
  SET sender_id = caller_id
  WHERE sender_id IS NULL;

ALTER TABLE call_signaling
  ALTER COLUMN sender_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'call_signaling'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE call_signaling;
  END IF;
END $$;
