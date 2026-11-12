/*
# Add group chat support

## Changes

1. Add `is_group` (boolean, default false) and `group_name` (text, nullable)
   columns to the existing `chats` table.

2. Add `group_avatar_url` (text, nullable) to `chats` for optional group icons.

3. Create a `create_group_chat` SECURITY DEFINER function that:
   - Inserts a new row into `chats` with `is_group = true` and the given name.
   - Inserts the creator and all selected members into `chat_participants`.
   - Returns the new chat UUID.

## Security
- The function is SECURITY DEFINER so it can insert into both `chats` and
  `chat_participants` in one call.  RLS on `chats` allows authenticated users
  to insert, and `chat_participants` already allows inserts for the caller's
  own user_id — but the function also inserts rows for OTHER users, which
  requires elevated privileges.
- No new RLS policies needed; existing chat_participants policies already
  allow members to read/update/delete their own participation rows.
*/

-- 1. Add group columns to chats
ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS group_avatar_url text;

-- 2. Create group chat function
CREATE OR REPLACE FUNCTION create_group_chat(
  p_group_name text,
  p_member_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_chat_id uuid;
  v_creator_id uuid := auth.uid();
  v_all_ids uuid[];
BEGIN
  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Combine creator + members, dedup
  v_all_ids := ARRAY(SELECT DISTINCT unnest(ARRAY[v_creator_id] || p_member_ids));

  -- Create the chat
  INSERT INTO chats (is_group, group_name)
  VALUES (true, p_group_name)
  RETURNING id INTO v_chat_id;

  -- Insert all participants
  INSERT INTO chat_participants (chat_id, user_id)
  SELECT v_chat_id, unnest(v_all_ids);

  RETURN v_chat_id;
END;
$$;