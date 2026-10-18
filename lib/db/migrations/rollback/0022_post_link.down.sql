-- Emergency rollback for 0022_post_link.sql (use with the previous API build).
-- Drops the post link column; links on posts are lost. Run as the database owner.
BEGIN;
ALTER TABLE sewspace_posts DROP COLUMN IF EXISTS link_url;
DELETE FROM sewspace_schema_migrations WHERE name = '0022_post_link.sql';
COMMIT;
