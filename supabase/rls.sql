-- ============================================================================
-- GoDiscover — Row Level Security (RLS) policies for `saved_items`
-- ============================================================================
--
-- WHAT THIS IS
--   Supabase tables are open to anyone with the project's anon key by default
--   (and the anon key is bundled into our client app, so it's effectively
--   public). RLS is Postgres' built-in mechanism for saying "a user can only
--   see/modify rows that belong to them." Once RLS is enabled on a table,
--   *every* query is filtered automatically — even if the app's code forgets
--   to add a WHERE clause.
--
-- WHY WE NEED IT
--   The queries in `lib/storage/saved.ts` (listSaved, removeSaved) don't
--   include an explicit `user_id` filter. They rely on RLS to enforce that
--   filter at the database level. Without RLS turned on, any signed-in user
--   could read and delete every other user's saved items.
--
-- HOW TO APPLY
--   1. Open https://supabase.com → your project → SQL Editor
--   2. Paste this entire file into a new query
--   3. Run it (the CREATE POLICY statements are idempotent if you drop first;
--      if any already exist from a previous run, the script will error — just
--      drop the conflicting one and re-run)
--   4. Confirm the verification queries at the bottom return what's expected
--
-- This file is checked into source control so the policies live alongside
-- the code that depends on them. If you change the schema or add new tables,
-- update this file too.
-- ============================================================================


-- Turn RLS on for the saved_items table. Once this runs, ALL queries against
-- the table are denied by default until at least one policy grants access.
ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;


-- Allow a signed-in user to SELECT only rows where the user_id column
-- matches their own auth UID.
CREATE POLICY "select_own_saved_items"
  ON saved_items
  FOR SELECT
  USING (auth.uid() = user_id);


-- Allow a signed-in user to INSERT new rows only if the user_id being
-- inserted matches their own auth UID (prevents inserting items "as"
-- someone else).
CREATE POLICY "insert_own_saved_items"
  ON saved_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- Allow a signed-in user to UPDATE only their own rows.
-- (Not strictly used today — saved.ts upserts rather than updates — but
-- included for completeness since upsert can fall through to UPDATE.)
CREATE POLICY "update_own_saved_items"
  ON saved_items
  FOR UPDATE
  USING (auth.uid() = user_id);


-- Allow a signed-in user to DELETE only their own rows.
CREATE POLICY "delete_own_saved_items"
  ON saved_items
  FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================================================
-- VERIFICATION QUERIES — run these after applying the policies above
-- ============================================================================

-- 1) Confirm RLS is enabled on saved_items. Expect rowsecurity = true.
--    SELECT relname, relrowsecurity AS rowsecurity
--    FROM pg_class
--    WHERE relname = 'saved_items';

-- 2) List all policies attached to the table. Expect 4 rows.
--    SELECT policyname, cmd, qual
--    FROM pg_policies
--    WHERE tablename = 'saved_items';

-- 3) End-to-end test (do this in the app, not in SQL):
--    - Sign in as user A on https://godiscover.netlify.app, save an item
--    - Sign out, sign in as a fresh user B
--    - User B should see an EMPTY Saved list (not user A's items)
