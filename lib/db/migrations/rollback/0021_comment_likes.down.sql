-- Emergency rollback for 0021_comment_likes.sql (use with the previous API build).
-- Drops comment likes; the likes themselves are lost. Run as the database owner.
BEGIN;
DROP FUNCTION IF EXISTS sewspace_comment_like_counts(integer[]);
DROP TABLE IF EXISTS sewspace_comment_likes;
DELETE FROM sewspace_schema_migrations WHERE name = '0021_comment_likes.sql';
COMMIT;
