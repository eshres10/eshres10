-- Emergency rollback for 0020_explore.sql (use with the previous API build).
-- Drops the Explore tables and the two post labels; saved collections and
-- feedback are lost. Run as the database owner.
BEGIN;
DROP TRIGGER IF EXISTS sewspace_explore_forget ON sewspace_posts;
DROP TRIGGER IF EXISTS sewspace_explore_forget ON sewspace_catalog;
DROP TRIGGER IF EXISTS sewspace_explore_forget ON sewspace_challenges;
DROP TRIGGER IF EXISTS sewspace_explore_forget ON sewspace_forum_topics;
DROP FUNCTION IF EXISTS sewspace_explore_forget();
DROP TABLE IF EXISTS sewspace_collection_items;
DROP TABLE IF EXISTS sewspace_collections;
DROP TABLE IF EXISTS sewspace_discover_feedback;
ALTER TABLE sewspace_posts DROP COLUMN IF EXISTS garment, DROP COLUMN IF EXISTS fabric;
DELETE FROM sewspace_schema_migrations WHERE name = '0020_explore.sql';
COMMIT;
