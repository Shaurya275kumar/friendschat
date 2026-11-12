/*
# Fix chat_participants SELECT policy — allow seeing all members of own chats

## Problem
The previous fix changed cp_read_own to USING (user_id = auth.uid()), which means
a user can only see THEIR OWN row in chat_participants. When loadOtherUser queries
for the other person's participant row with .neq('user_id', user.id), RLS hides
that row completely — returning nothing. This causes the chat header to show "?"
and "Chat" with no name/avatar.

## Solution
Replace cp_read_own with a policy that lets any authenticated user see ALL
participant rows for chats they belong to. We use the SECURITY DEFINER helper
function is_chat_participant() (created in the previous migration) to avoid
the recursive RLS loop that caused the original problem.

## Security
- Users can only read participant rows for chats they are already in.
- The is_chat_participant() function is SECURITY DEFINER and bypasses RLS
  safely — it only returns a boolean, no data leakage.
- No changes to INSERT/UPDATE/DELETE policies.
*/

DROP POLICY IF EXISTS "cp_read_own" ON chat_participants;
CREATE POLICY "cp_read_members" ON chat_participants
  FOR SELECT TO authenticated
  USING (is_chat_participant(chat_id, auth.uid()));
