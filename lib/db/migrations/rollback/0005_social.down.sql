-- Emergency rollback for 0005: switches likes, comments, saves and reports off
-- for the app (RLS with no policies hides every row) and restores the Phase 3
-- follow rule. Tables and data are kept.
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0005_social.down.sql
BEGIN;
DROP POLICY IF EXISTS visible_read ON sewspace_likes;
DROP POLICY IF EXISTS own_insert ON sewspace_likes;
DROP POLICY IF EXISTS own_delete ON sewspace_likes;
DROP POLICY IF EXISTS visible_read ON sewspace_comments;
DROP POLICY IF EXISTS own_insert ON sewspace_comments;
DROP POLICY IF EXISTS author_delete ON sewspace_comments;
DROP POLICY IF EXISTS admin_read ON sewspace_comments;
DROP POLICY IF EXISTS own_saves ON sewspace_saves;
DROP POLICY IF EXISTS own_reports ON sewspace_reports;
DROP POLICY IF EXISTS own_insert ON sewspace_reports;
DROP POLICY IF EXISTS admin_all ON sewspace_reports;
DROP POLICY IF EXISTS admin_read ON sewspace_posts;
DROP POLICY IF EXISTS admin_delete ON sewspace_posts;
ALTER POLICY own_follows ON sewspace_follows WITH CHECK (follower_id = sewspace_current_user_id());
DROP TRIGGER IF EXISTS sewspace_block_unfollow ON sewspace_blocks;
DROP FUNCTION IF EXISTS sewspace_block_unfollow();
DROP FUNCTION IF EXISTS sewspace_post_counts(integer[]);
DROP FUNCTION IF EXISTS sewspace_my_blocks();
DELETE FROM sewspace_schema_migrations WHERE name = '0005_social.sql';
COMMIT;
