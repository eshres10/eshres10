-- Emergency rollback for 0024_saved_indexes.sql. Drops two indexes; no data is touched.
BEGIN;
DROP INDEX IF EXISTS sewspace_saves_user_recent_idx;
DROP INDEX IF EXISTS sewspace_catalog_saves_user_recent_idx;
DELETE FROM sewspace_schema_migrations WHERE name = '0024_saved_indexes.sql';
COMMIT;
