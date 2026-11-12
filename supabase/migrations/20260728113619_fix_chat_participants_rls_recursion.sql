/*
# Fix recursive RLS on chat_participants (root cause of messages not sending)

## Problem
The `cp_read_own` policy on `chat_participants` was self-referencing:
  USING (user_id = auth.uid() OR chat_id IN (SELECT chat_id FROM chat_participants cp2 WHERE cp2.user_id = auth.uid()))
The subquery on `chat_participants` runs under RLS, which triggers `cp_read_own`
again, causing infinite recursion. PostgreSQL detects this and errors out.

This broke EVERY policy that references `chat_participants` in a subquery:
- `messages_insert_participant` — inserts silently failed (zero messages in DB)
- `messages_read_participant` — reads silently returned nothing
- `chats_read_participant` — chats appeared empty

## Solution
1. Create a SECURITY DEFINER function `is_chat_participant(p_chat_id, p_user_id)`
   that bypasses RLS to check participation. This avoids the recursion.
2. Rewrite `cp_read_own` to use a simple ownership check (user_id = auth.uid())
   without the recursive subquery.
3. Rewrite `chats_read_participant`, `messages_read_participant`, and
   `messages_insert_participant` to use `is_chat_participant()` instead of
   subquerying `chat_participants` directly.

## Security
- `is_chat_participant()` is SECURITY DEFINER, owned by postgres, so it can read
  `chat_participants` without RLS. It only returns a boolean — no data leakage.
- All existing ownership semantics are preserved.
- No changes to table structure or data.
*/

-- ============ HELPER FUNCTION ============
CREATE OR REPLACE FUNCTION is_chat_participant(p_chat_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_participants
    WHERE chat_id = p_chat_id AND user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION is_chat_participant(uuid, uuid) TO authenticated;

-- ============ FIX chat_participants SELECT (remove recursion) ============
DROP POLICY IF EXISTS "cp_read_own" ON chat_participants;
CREATE POLICY "cp_read_own" ON chat_participants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============ FIX chats SELECT ============
DROP POLICY IF EXISTS "chats_read_participant" ON chats;
CREATE POLICY "chats_read_participant" ON chats
  FOR SELECT TO authenticated
  USING (is_chat_participant(chats.id, auth.uid()));

-- ============ FIX messages SELECT ============
DROP POLICY IF EXISTS "messages_read_participant" ON messages;
CREATE POLICY "messages_read_participant" ON messages
  FOR SELECT TO authenticated
  USING (is_chat_participant(messages.chat_id, auth.uid()));

-- ============ FIX messages INSERT ============
DROP POLICY IF EXISTS "messages_insert_participant" ON messages;
CREATE POLICY "messages_insert_participant" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND is_chat_participant(messages.chat_id, auth.uid())
  );