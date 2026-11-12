/*
# FriendsChat - Core messaging schema

Builds a WhatsApp-style messaging backend: user profiles keyed by phone number,
friendship requests, 1:1 chats, chat participants, messages with edit/delete,
media attachments, and presence. Realtime enabled on messages, chat_participants,
presence, and friendships.

## Tables (created first, then policies)
1. profiles - id (uuid PK -> auth.users), phone (unique), name, avatar_url, about,
   is_online, last_seen, created_at
2. friendships - requester_id, addressee_id, status (pending/accepted/blocked), unique pair
3. chats - id, created_at
4. chat_participants - (chat_id, user_id) PK
5. messages - chat_id, sender_id, body, media_url, media_type, edited_at, deleted_at, created_at
6. presence - user_id PK, is_online, last_seen

## RLS
- profiles: read all (authenticated), update/insert own
- friendships: read own (requester or addressee), insert as requester, update own, delete own
- chats: read only chats user participates in, insert by authenticated
- chat_participants: read own chats or self, insert self only
- messages: read in chats user is in, insert as sender in chats user is in, update/delete own
- presence: read all, update/insert own

## Notes
1. Soft delete on messages so deleted placeholder can render.
2. Realtime publication includes messages, chat_participants, presence, friendships.
*/

-- ============ TABLES ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text UNIQUE NOT NULL,
  name text NOT NULL,
  avatar_url text,
  about text NOT NULL DEFAULT 'Hey there! I''m using FriendsChat.',
  is_online boolean NOT NULL DEFAULT false,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);

CREATE TABLE IF NOT EXISTS chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_participants (
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text,
  media_url text,
  media_type text CHECK (media_type IS NULL OR media_type IN ('image','video')),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS presence (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  is_online boolean NOT NULL DEFAULT false,
  last_seen timestamptz NOT NULL DEFAULT now()
);

-- ============ ENABLE RLS ============
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES ============
-- profiles
DROP POLICY IF EXISTS "profiles_read_all" ON profiles;
CREATE POLICY "profiles_read_all" ON profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- friendships
DROP POLICY IF EXISTS "friendships_read_own" ON friendships;
CREATE POLICY "friendships_read_own" ON friendships
  FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "friendships_insert_requester" ON friendships;
CREATE POLICY "friendships_insert_requester" ON friendships
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "friendships_update_own" ON friendships;
CREATE POLICY "friendships_update_own" ON friendships
  FOR UPDATE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "friendships_delete_own" ON friendships;
CREATE POLICY "friendships_delete_own" ON friendships
  FOR DELETE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- chats
DROP POLICY IF EXISTS "chats_read_participant" ON chats;
CREATE POLICY "chats_read_participant" ON chats
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_participants cp WHERE cp.chat_id = chats.id AND cp.user_id = auth.uid()));

DROP POLICY IF EXISTS "chats_insert_authed" ON chats;
CREATE POLICY "chats_insert_authed" ON chats
  FOR INSERT TO authenticated WITH CHECK (true);

-- chat_participants
DROP POLICY IF EXISTS "cp_read_own" ON chat_participants;
CREATE POLICY "cp_read_own" ON chat_participants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR chat_id IN (SELECT chat_id FROM chat_participants cp2 WHERE cp2.user_id = auth.uid()));

DROP POLICY IF EXISTS "cp_insert_self" ON chat_participants;
CREATE POLICY "cp_insert_self" ON chat_participants
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- messages
DROP POLICY IF EXISTS "messages_read_participant" ON messages;
CREATE POLICY "messages_read_participant" ON messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_participants cp WHERE cp.chat_id = messages.chat_id AND cp.user_id = auth.uid()));

DROP POLICY IF EXISTS "messages_insert_participant" ON messages;
CREATE POLICY "messages_insert_participant" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (SELECT 1 FROM chat_participants cp WHERE cp.chat_id = messages.chat_id AND cp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "messages_update_own" ON messages;
CREATE POLICY "messages_update_own" ON messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "messages_delete_own" ON messages;
CREATE POLICY "messages_delete_own" ON messages
  FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

-- presence
DROP POLICY IF EXISTS "presence_read_all" ON presence;
CREATE POLICY "presence_read_all" ON presence
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "presence_update_own" ON presence;
CREATE POLICY "presence_update_own" ON presence
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "presence_insert_own" ON presence;
CREATE POLICY "presence_insert_own" ON presence
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages (chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cp_user ON chat_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships (requester_id, status);

-- ============ REALTIME ============
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['messages','chat_participants','presence','friendships'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;