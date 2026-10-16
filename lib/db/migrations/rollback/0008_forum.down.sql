-- Emergency rollback for 0008: switches the forum off for the app (RLS with
-- no policies hides every row). Tables and data are kept. The widened report
-- check stays (it only allows more).
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0008_forum.down.sql
BEGIN;
DROP POLICY IF EXISTS visible_read ON sewspace_forum_topics;
DROP POLICY IF EXISTS own_insert ON sewspace_forum_topics;
DROP POLICY IF EXISTS author_update ON sewspace_forum_topics;
DROP POLICY IF EXISTS author_delete ON sewspace_forum_topics;
DROP POLICY IF EXISTS visible_read ON sewspace_forum_replies;
DROP POLICY IF EXISTS own_insert ON sewspace_forum_replies;
DROP POLICY IF EXISTS own_update ON sewspace_forum_replies;
DROP POLICY IF EXISTS own_delete ON sewspace_forum_replies;
DROP POLICY IF EXISTS own_votes ON sewspace_forum_votes;
DROP POLICY IF EXISTS visible_read ON sewspace_forum_poll_options;
DROP POLICY IF EXISTS author_insert ON sewspace_forum_poll_options;
DROP POLICY IF EXISTS own_poll_vote ON sewspace_forum_poll_votes;
DROP FUNCTION IF EXISTS sewspace_forum_moderate(integer, boolean, boolean);
DROP FUNCTION IF EXISTS sewspace_poll_results(integer);
DELETE FROM sewspace_schema_migrations WHERE name = '0008_forum.sql';
COMMIT;
