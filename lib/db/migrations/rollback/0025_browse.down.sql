-- Emergency rollback for 0025_browse.sql (use with the previous API build).
-- Drops the two functions. The wider label checks stay: narrowing them would
-- fail on posts that already use the new labels.
BEGIN;
DROP FUNCTION IF EXISTS sewspace_trending_hashtags(integer, integer);
DROP FUNCTION IF EXISTS sewspace_save_counts(integer[], integer);
DELETE FROM sewspace_schema_migrations WHERE name = '0025_browse.sql';
COMMIT;
