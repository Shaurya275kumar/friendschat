/*
# Fix chat creation + add status field to profiles

## Problem
The `getOrCreateChat` client function tried to insert BOTH participants
into `chat_participants` in a single insert. RLS policy `cp_insert_self`
only allows inserting rows where `user_id = auth.uid()`, so the other
user's row was rejected, causing chat creation to fail silently.

## Solution
1. Create a SECURITY DEFINER function `create_or_get_chat(other_user_id)`
   that runs with elevated privileges (bypassing RLS) to:
   - Check if a chat already exists between the two users
   - If not, create a new chat and add both participants
   - Return the chat_id
   This is the standard pattern for multi-row inserts that cross ownership
   boundaries.

2. Add a `status` text column to `profiles` so users can set a custom
   status message (separate from the `about` field). This powers the new
   "status" feature requested by the user.

## Security
- The RPC function is SECURITY DEFINER and owned by postgres, so it can
  insert both participant rows. It only accepts the other user's ID and
  uses auth.uid() for the caller — no injection risk.
- No changes to existing RLS policies.
- The `status` column inherits existing profile RLS (read all, update own).

## Notes
1. The function is idempotent — calling it twice with the same users
   returns the same chat.
2. The `status` column defaults to NULL (no status set).
*/

-- Add status column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status text;

-- Create the RPC function to create or get a 1:1 chat
CREATE OR REPLACE FUNCTION create_or_get_chat(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chat_id uuid;
  existing_chat_id uuid;
BEGIN
  -- Validate: caller must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Validate: can't chat with yourself
  IF other_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot create a chat with yourself';
  END IF;

  -- Check if a chat already exists between these two users
  SELECT cp1.chat_id INTO existing_chat_id
  FROM chat_participants cp1
  JOIN chat_participants cp2 ON cp1.chat_id = cp2.chat_id
  WHERE cp1.user_id = auth.uid()
    AND cp2.user_id = other_user_id
  LIMIT 1;

  IF existing_chat_id IS NOT NULL THEN
    RETURN existing_chat_id;
  END IF;

  -- Create a new chat
  INSERT INTO chats DEFAULT VALUES RETURNING id INTO chat_id;

  -- Add both participants
  INSERT INTO chat_participants (chat_id, user_id) VALUES
    (chat_id, auth.uid()),
    (chat_id, other_user_id);

  RETURN chat_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION create_or_get_chat(uuid) TO authenticated;
