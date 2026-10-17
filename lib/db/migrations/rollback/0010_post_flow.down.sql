-- Emergency rollback for 0010: switches hashtags off for the app (RLS with no
-- policies hides every row; the functions are dropped). Columns and data are
-- kept: alt_text and aspect are harmless to older code.
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0010_post_flow.down.sql
BEGIN;
DROP POLICY IF EXISTS owner_all ON sewspace_post_hashtags;
DROP POLICY IF EXISTS visible_read ON sewspace_post_hashtags;
DROP POLICY IF EXISTS visible_read ON sewspace_hashtags;
DROP FUNCTION IF EXISTS sewspace_hashtag_ids(text[]);
DROP FUNCTION IF EXISTS sewspace_hashtag_counts(text[]);
DROP FUNCTION IF EXISTS sewspace_hashtag_prefix(text, integer);
DELETE FROM sewspace_schema_migrations WHERE name = '0010_post_flow.sql';
COMMIT;
