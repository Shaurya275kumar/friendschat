/*
# Fix presence: heartbeat function + profiles sync trigger

## Problem
The `profiles.is_online` column gets stuck at `true` when users close their
browser tab, because `AppState` does not fire a "background" event on web
when the tab is closed.  The `presence` table is the source of truth, but
`profiles.is_online` is what the app reads to display online dots.

## Changes

1. New function `sync_profiles_from_presence()` — trigger function that
   copies `is_online` and `last_seen` from the `presence` row into the
   matching `profiles` row after every INSERT/UPDATE on `presence`.

2. New trigger `sync_profiles_presence` — fires the function above.

3. New function `cleanup_stale_presence()` — marks any user whose
   `presence.last_seen` is older than 90 seconds as offline.  Called from
   the app on a 30-second heartbeat and on app load.

4. Reset all currently-stuck `profiles.is_online = true` rows whose
   `presence` row says they are offline.

## Security
- `cleanup_stale_presence` is `SECURITY DEFINER` so any authenticated user
  can call it via RPC without needing UPDATE privileges on every row.
- No new policies needed; existing presence/profiles policies remain.
*/

-- 1. Trigger function: sync profiles from presence
CREATE OR REPLACE FUNCTION sync_profiles_from_presence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
    SET is_online = NEW.is_online,
        last_seen = NEW.last_seen
    WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

-- 2. Trigger on presence table
DROP TRIGGER IF EXISTS sync_profiles_presence ON presence;
CREATE TRIGGER sync_profiles_presence
  AFTER INSERT OR UPDATE ON presence
  FOR EACH ROW
  EXECUTE FUNCTION sync_profiles_from_presence();

-- 3. Cleanup function for stale presence
CREATE OR REPLACE FUNCTION cleanup_stale_presence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark users offline if last_seen > 90 seconds ago
  UPDATE presence
    SET is_online = false
    WHERE is_online = true
      AND last_seen < now() - interval '90 seconds';

  -- Sync all presence rows to profiles (in case trigger missed any)
  UPDATE profiles p
    SET is_online = pr.is_online,
        last_seen = pr.last_seen
    FROM presence pr
    WHERE pr.user_id = p.id
      AND (p.is_online IS DISTINCT FROM pr.is_online
           OR p.last_seen IS DISTINCT FROM pr.last_seen);
END;
$$;

-- 4. Fix currently-stuck rows
UPDATE profiles p
  SET is_online = pr.is_online,
      last_seen = pr.last_seen
  FROM presence pr
  WHERE pr.user_id = p.id
    AND p.is_online IS DISTINCT FROM pr.is_online;
