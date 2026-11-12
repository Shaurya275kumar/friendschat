/*
# Clean up orphaned auth.users and fix sign-up flow

## Problem
Several auth.users entries exist without a corresponding profiles row.
When someone tries to sign up with one of those emails, Supabase returns
"User already registered" but the user has no profile and can't use the app.

## Changes
1. Delete orphaned auth.users entries (no matching profile).
   This frees up those emails for re-registration.
2. The existing trigger `cascade_delete_auth_user` already handles future
   profile deletions correctly.
*/

-- Delete auth.users rows that have no matching profile
DELETE FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.users.id);
