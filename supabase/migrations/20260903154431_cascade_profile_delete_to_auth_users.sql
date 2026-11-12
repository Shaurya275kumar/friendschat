/*
# Cascade profile deletion to auth.users (forget email + all data)

## Problem
When a user's profile is deleted from the `profiles` table, the corresponding
`auth.users` row (which holds the email) is NOT automatically deleted.  This
means the email stays "registered" and the user can never sign up again with
the same email.  Additionally, `call_signaling` references `auth.users` directly
(not `profiles`), so deleting a profile leaves orphaned call signaling rows.

## Solution
Add an AFTER DELETE trigger on `profiles` that deletes the matching
`auth.users` row.  Since `auth.users` has ON DELETE CASCADE to:
  - profiles (already deleted, no-op)
  - call_signaling (caller_id, callee_id, sender_id)
  - message_deletions (user_id)
...and profiles cascades to:
  - chat_participants, friendships, messages, presence, stories, story_views
...deleting the auth.users row cleans up ALL user data in one step.

## Security
- The trigger function is SECURITY DEFINER because only the service role /
  postgres user can delete from auth.users.  This allows an admin to delete
  a profile row and have everything cascade automatically.
- No new RLS policies needed.
*/

CREATE OR REPLACE FUNCTION delete_auth_user_on_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete the auth.users row; everything else cascades from it.
  -- If the auth.users row is already gone (e.g. cascade from auth deletion),
  -- this is a no-op.
  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cascade_delete_auth_user ON profiles;
CREATE TRIGGER cascade_delete_auth_user
  AFTER DELETE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION delete_auth_user_on_profile_delete();
